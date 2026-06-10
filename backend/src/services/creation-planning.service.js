const { v4: uuidv4 } = require('uuid');
const { getAsset, getAssetSlice, listAllAssets, recallAssets } = require('./asset.service');
const { searchSlices } = require('./asset-slice.service');
const { getStoryboard } = require('./storyboard.service');
const { matchAssetsForScene } = require('./scene-asset-matching.service');
const { listEditingPlans, writeEditingPlans } = require('./storage.service');
const { buildSmartEditingPlan } = require('./creation-agent.service');

function now() {
  return new Date().toISOString();
}

function clampTotalDuration(value) {
  const parsed = Number(value || 15);
  if (!Number.isFinite(parsed) || parsed <= 0) return 15;
  return Math.min(15, Number(parsed.toFixed(1)));
}

function normalizeIdList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (!value) return [];
  return [String(value).trim()].filter(Boolean);
}

async function savePlan(plan) {
  const plans = await listEditingPlans();
  await writeEditingPlans([plan, ...plans.filter((item) => item.id !== plan.id)]);
  return plan;
}

async function getEditingPlan(projectId, planId) {
  const plans = await listEditingPlans();
  return plans.find((plan) => plan.id === planId && plan.projectId === projectId) || null;
}

function clipDurationFromSlice(slice, fallback) {
  if (!slice) return fallback;
  const duration = Number(slice.duration || (Number(slice.endTime) - Number(slice.startTime)));
  if (!Number.isFinite(duration) || duration <= 0) return fallback;
  return Math.min(fallback, Number(duration.toFixed(1)));
}

function rebalanceClipDurations(clips, targetDuration) {
  const total = clips.reduce((sum, clip) => sum + Number(clip.duration || 0), 0);
  if (total <= targetDuration || total <= 0) return clips;
  const ratio = targetDuration / total;
  return clips.map((clip) => {
    const duration = Math.max(1, Number((clip.duration * ratio).toFixed(1)));
    return {
      ...clip,
      duration,
      endTime: clip.startTime !== null && clip.startTime !== undefined ? Number((Number(clip.startTime) + duration).toFixed(1)) : clip.endTime,
    };
  });
}

function buildClip({ asset, slice, order, duration, subtitle, voiceover, sceneId, role }) {
  const fallbackDuration = Math.max(1, Number(duration || 3));
  const clipDuration = clipDurationFromSlice(slice, fallbackDuration);
  const startTime = slice ? Number(slice.startTime || 0) : 0;
  const endTime = slice ? Number(slice.endTime || startTime + clipDuration) : (asset.mediaType === 'video' ? clipDuration : null);
  return {
    id: `clip_${uuidv4()}`,
    order,
    assetId: asset.id,
    sliceId: slice?.id || null,
    sourceUrl: asset.fileUrl || asset.url || '',
    mediaType: asset.mediaType || asset.type || 'image',
    startTime,
    endTime,
    duration: clipDuration,
    fitMode: 'cover',
    crop: null,
    transitionIn: order === 1 ? 'cut' : 'quick_cut',
    transitionOut: 'cut',
    subtitle: subtitle || slice?.transcript || asset.analysis?.summary || asset.title || '',
    voiceover: voiceover || '',
    sceneId: sceneId || null,
    role: role || 'asset_first',
  };
}

function buildGeneratedSceneClip({ scene, order }) {
  const duration = Math.max(1, Number(scene.duration || scene.durationSeconds || 3));
  return {
    id: `clip_${uuidv4()}`,
    order,
    assetId: null,
    sliceId: null,
    sourceUrl: scene.generatedVideoUrl,
    mediaType: 'video',
    startTime: 0,
    endTime: duration,
    duration,
    fitMode: 'cover',
    crop: null,
    transitionIn: order === 1 ? 'cut' : 'quick_cut',
    transitionOut: 'cut',
    subtitle: scene.subtitle || scene.subtitleText || '',
    voiceover: scene.voiceover || scene.narration || scene.scriptText || '',
    sceneId: scene.id || scene.sceneId || null,
    role: scene.sceneRole || 'storyboard_generated_scene',
    sourceType: 'storyboard_generated_output',
  };
}

async function clipFromAssetSelection(projectId, assetId, sliceId, order, targetStepDuration) {
  const asset = await getAsset(projectId, assetId);
  if (!asset) {
    const error = new Error(`Asset ${assetId} does not belong to project ${projectId}.`);
    error.statusCode = 400;
    error.code = 'ASSET_PROJECT_MISMATCH';
    throw error;
  }
  let slice = null;
  if (sliceId) {
    slice = await getAssetSlice(projectId, asset.id, sliceId);
    if (!slice) {
      const error = new Error(`Asset slice ${sliceId} does not belong to asset ${asset.id} in project ${projectId}.`);
      error.statusCode = 400;
      error.code = 'SLICE_PROJECT_MISMATCH';
      throw error;
    }
  }
  return buildClip({ asset, slice, order, duration: targetStepDuration, subtitle: asset.title, role: 'asset_first' });
}

async function clipFromSliceSelection(projectId, sliceId, order, targetStepDuration) {
  const projectAssets = await listAllAssets(projectId);
  const assetIds = projectAssets.map((asset) => asset.id).filter(Boolean);
  const result = await searchSlices(projectId, { assetIds });
  const slice = result.items.find((item) => item.id === sliceId);
  if (!slice) {
    const error = new Error(`Asset slice ${sliceId} does not belong to project ${projectId}.`);
    error.statusCode = 400;
    error.code = 'SLICE_PROJECT_MISMATCH';
    throw error;
  }
  const asset = await getAsset(projectId, slice.assetId);
  if (!asset) {
    const error = new Error(`Asset for slice ${sliceId} does not belong to project ${projectId}.`);
    error.statusCode = 400;
    error.code = 'ASSET_PROJECT_MISMATCH';
    throw error;
  }
  return buildClip({ asset, slice, order, duration: targetStepDuration, subtitle: asset.title, role: 'asset_first_slice' });
}

async function createAssetFirstPlan(projectId, payload = {}) {
  const targetDuration = clampTotalDuration(payload.targetDuration);
  const selectedAssetIds = normalizeIdList(payload.selectedAssetIds || payload.assetIds);
  const selectedAssetSliceIds = normalizeIdList(payload.selectedAssetSliceIds || payload.sliceIds);
  const clips = [];
  const desiredCount = Math.max(1, selectedAssetIds.length || selectedAssetSliceIds.length || 4);
  const targetStepDuration = Number((targetDuration / Math.min(5, desiredCount)).toFixed(1));

  for (let index = 0; index < selectedAssetIds.length; index += 1) {
    clips.push(await clipFromAssetSelection(projectId, selectedAssetIds[index], selectedAssetSliceIds[index], clips.length + 1, targetStepDuration));
  }
  if (!selectedAssetIds.length && selectedAssetSliceIds.length) {
    for (const sliceId of selectedAssetSliceIds) {
      clips.push(await clipFromSliceSelection(projectId, sliceId, clips.length + 1, targetStepDuration));
    }
  }

  if (!clips.length) {
    const recalled = await recallAssets(projectId, {
      keywords: payload.keywords || payload.keyword || payload.editingGoal || '',
      optionalTags: payload.tags || [],
      purpose: 'creation',
      limit: 5,
    });
    for (const item of recalled.items || []) {
      clips.push(buildClip({
        asset: item.asset,
        slice: item.matchedSlices?.[0] || null,
        order: clips.length + 1,
        duration: targetStepDuration,
        subtitle: item.asset?.title,
        role: item.usageSuggestion || 'asset_first',
      }));
    }
  }

  const finalClips = rebalanceClipDurations(clips.slice(0, 5), targetDuration);
  const usedAssetIds = [...new Set(finalClips.map((clip) => clip.assetId).filter(Boolean))];
  const usedAssetSliceIds = [...new Set(finalClips.map((clip) => clip.sliceId).filter(Boolean))];
  const totalDuration = Number(finalClips.reduce((sum, clip) => sum + Number(clip.duration || 0), 0).toFixed(1));
  const plan = {
    id: `editing_plan_${uuidv4()}`,
    projectId,
    mode: 'asset_first',
    targetDuration,
    aspectRatio: payload.aspectRatio || '9:16',
    clips: finalClips,
    audio: { bgm: payload.bgm || null, voiceover: payload.voiceover || null },
    subtitles: finalClips.map((clip) => ({ clipId: clip.id, text: clip.subtitle, start: null, duration: clip.duration })),
    transitions: finalClips.map((clip) => ({ clipId: clip.id, in: clip.transitionIn, out: clip.transitionOut })),
    renderSettings: {
      aspectRatio: payload.aspectRatio || '9:16',
      width: 1080,
      height: 1920,
      fps: 30,
      format: 'mp4',
      maxDuration: 15,
      style: payload.style || 'clean_ecommerce',
      language: payload.language || 'zh-CN',
      audioMode: payload.audioMode === 'uploaded_bgm' || payload.audioMode === 'silent' ? payload.audioMode : 'preserve_source',
      backgroundMusicMixMode: payload.backgroundMusicMixMode === 'replace_source' ? 'replace_source' : payload.backgroundMusicMixMode === 'mix_under_source' ? 'mix_under_source' : null,
      backgroundMusicVolume: Number.isFinite(Number(payload.backgroundMusicVolume)) ? Number(payload.backgroundMusicVolume) : null,
    },
    usedAssetIds,
    usedAssetSliceIds,
    usedScriptId: null,
    usedStoryboardId: null,
    metadata: {
      duration: totalDuration,
      fallbackReason: finalClips.length ? null : 'No selected or recalled assets available for asset-first creation.',
      source: 'asset_first_creation_plan',
    },
    createdAt: now(),
  };
  return savePlan(plan);
}

async function createStoryboardDrivenPlan(projectId, payload = {}) {
  const storyboard = payload.storyboardId ? await getStoryboard(projectId) : null;
  const scenes = Array.isArray(payload.scenes) && payload.scenes.length ? payload.scenes : (storyboard?.scenes || []);
  if (!scenes.length) {
    const error = new Error('storyboard_driven creation requires scenes or an existing storyboard.');
    error.statusCode = 400;
    throw error;
  }
  const targetDuration = clampTotalDuration(payload.targetDuration || scenes.reduce((sum, scene) => sum + Number(scene.duration || scene.durationSeconds || 3), 0));
  const clips = [];
  for (const scene of scenes) {
    if (scene.generatedVideoUrl) {
      clips.push(buildGeneratedSceneClip({ scene, order: clips.length + 1 }));
      continue;
    }
    let assetIds = normalizeIdList(scene.selectedAssetIds);
    let sliceIds = normalizeIdList(scene.selectedAssetSliceIds);
    if (!assetIds.length && scene.assetRequirements) {
      const match = await matchAssetsForScene(projectId, scene);
      assetIds = match.selectedAssetIds;
      sliceIds = match.selectedAssetSliceIds;
    }
    if (!assetIds.length) continue;
    clips.push(await clipFromAssetSelection(projectId, assetIds[0], sliceIds[0], clips.length + 1, Number(scene.duration || scene.durationSeconds || 3)));
    clips[clips.length - 1] = {
      ...clips[clips.length - 1],
      subtitle: scene.subtitle || scene.subtitleText || clips[clips.length - 1].subtitle,
      voiceover: scene.voiceover || scene.narration || scene.scriptText || '',
      sceneId: scene.id || scene.sceneId || null,
      role: scene.sceneRole || 'storyboard_scene',
    };
  }
  if (!clips.length) {
    const error = new Error('No storyboard scenes could be matched to assets. Upload matching assets or select scene assets first.');
    error.statusCode = 400;
    throw error;
  }
  const finalClips = rebalanceClipDurations(clips, targetDuration);
  const usedAssetIds = [...new Set(finalClips.map((clip) => clip.assetId).filter(Boolean))];
  const usedAssetSliceIds = [...new Set(finalClips.map((clip) => clip.sliceId).filter(Boolean))];
  const totalDuration = Number(finalClips.reduce((sum, clip) => sum + Number(clip.duration || 0), 0).toFixed(1));
  const plan = {
    id: `editing_plan_${uuidv4()}`,
    projectId,
    mode: 'storyboard_driven',
    targetDuration,
    aspectRatio: payload.aspectRatio || storyboard?.aspectRatio || '9:16',
    clips: finalClips,
    audio: { bgm: payload.bgm || null, voiceover: null },
    subtitles: finalClips.map((clip) => ({ clipId: clip.id, text: clip.subtitle, start: null, duration: clip.duration })),
    transitions: finalClips.map((clip) => ({ clipId: clip.id, in: clip.transitionIn, out: clip.transitionOut })),
    renderSettings: {
      aspectRatio: payload.aspectRatio || storyboard?.aspectRatio || '9:16',
      width: 1080,
      height: 1920,
      fps: 30,
      format: 'mp4',
      maxDuration: 15,
      style: payload.style || 'storyboard_ecommerce',
      language: payload.language || 'zh-CN',
      audioMode: payload.audioMode === 'uploaded_bgm' || payload.audioMode === 'silent' ? payload.audioMode : 'preserve_source',
      backgroundMusicMixMode: payload.backgroundMusicMixMode === 'replace_source' ? 'replace_source' : payload.backgroundMusicMixMode === 'mix_under_source' ? 'mix_under_source' : null,
      backgroundMusicVolume: Number.isFinite(Number(payload.backgroundMusicVolume)) ? Number(payload.backgroundMusicVolume) : null,
    },
    usedAssetIds,
    usedAssetSliceIds,
    usedScriptId: payload.scriptId || storyboard?.scriptId || null,
    usedStoryboardId: payload.storyboardId || storyboard?.id || storyboard?.storyboardId || null,
    metadata: { duration: totalDuration, source: 'storyboard_driven_creation_plan' },
    createdAt: now(),
  };
  return savePlan(plan);
}

async function createEditingPlan(projectId, payload = {}) {
  if (payload.mode === 'smart_editing') return createSmartEditingPlan(projectId, payload);
  return payload.mode === 'storyboard_driven'
    ? createStoryboardDrivenPlan(projectId, payload)
    : createAssetFirstPlan(projectId, payload);
}

async function createSmartEditingPlan(projectId, payload = {}) {
  const plan = await buildSmartEditingPlan(projectId, payload);
  return savePlan(plan);
}

module.exports = {
  createAssetFirstPlan,
  createStoryboardDrivenPlan,
  createSmartEditingPlan,
  createEditingPlan,
  getEditingPlan,
};
