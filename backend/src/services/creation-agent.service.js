const { v4: uuidv4 } = require('uuid');
const { listAllAssets } = require('./asset.service');
const { searchSlices } = require('./asset-slice.service');
const { getProject } = require('./project.service');
const { getScript } = require('./script.service');
const { getStoryboard } = require('./storyboard.service');
const { generateJsonWithSeed2 } = require('../providers/volcengine/seed2.client');

const EDITING_PLAN_SCHEMA = {
  clips: [
    {
      sceneId: 'storyboard scene id',
      assetId: 'project asset id',
      sliceId: 'project slice id or null',
      duration: 3,
      startTime: 0,
      endTime: 3,
      transitionIn: 'cut',
      transitionOut: 'cut',
      captionDraft: 'optional caption text, not burned into video by default',
      reason: 'why this asset/slice matches the scene',
    },
  ],
  transitions: [{ clipIndex: 1, in: 'cut', out: 'quick_cut' }],
  captionDrafts: [{ clipIndex: 1, text: 'caption draft only' }],
  voiceoverDrafts: [{ clipIndex: 1, text: 'voiceover text draft only; no TTS audio generated' }],
  bgmRecommendation: { style: 'music style only', uploadedAssetId: '' },
  missingSceneRequests: [{ sceneId: 'scene id', reason: 'why SeedDance filler may be needed' }],
  complianceNotes: ['Do not copy public videos. Captions are drafts unless explicitly exported as sidecar.'],
};

function now() {
  return new Date().toISOString();
}

function idList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (!value) return [];
  return [String(value).trim()].filter(Boolean);
}

function shortText(value, max = 600) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function assetId(asset) {
  return asset?.id || asset?.assetId || asset?.materialId;
}

function compactAsset(asset = {}) {
  return {
    assetId: assetId(asset),
    title: asset.title || asset.name || asset.originalName || '',
    mediaType: asset.mediaType || asset.type || '',
    assetType: asset.assetType || asset.type || '',
    tags: [...new Set([...(asset.tags || []), ...(asset.systemTags || []), ...(asset.userTags || []), ...(asset.analysis?.tags || [])])].slice(0, 16),
    summary: shortText(asset.analysis?.summary || asset.description || asset.title || '', 360),
  };
}

function compactSlice(slice = {}) {
  return {
    sliceId: slice.id,
    assetId: slice.assetId,
    startTime: slice.startTime,
    endTime: slice.endTime,
    duration: slice.duration,
    tags: slice.tags || [],
    visualDescription: shortText(slice.visualDescription || slice.transcript || '', 360),
  };
}

function compactScene(scene = {}, index = 0) {
  return {
    sceneId: scene.id || scene.sceneId || `scene_${index + 1}`,
    order: scene.order || scene.sceneOrder || index + 1,
    duration: scene.duration || scene.durationSeconds || 3,
    sceneRole: scene.sceneRole || 'scene',
    sellingPoint: scene.sellingPoint || '',
    narrativeGoal: scene.narrativeGoal || '',
    visualDescription: scene.visualDescription || '',
    voiceover: scene.voiceover || scene.narration || scene.scriptText || '',
    subtitle: scene.subtitle || scene.subtitleText || '',
    selectedAssetIds: idList(scene.selectedAssetIds),
    selectedAssetSliceIds: idList(scene.selectedAssetSliceIds),
    generatedVideoUrl: scene.generatedVideoUrl || '',
  };
}

function normalizeDuration(value, fallback = 3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(6, Number(parsed.toFixed(1))));
}

function fallbackClips(scenes = [], assets = [], slices = []) {
  const firstVideo = assets.find((asset) => asset.mediaType === 'video' || asset.type === 'video');
  const firstImage = assets.find((asset) => asset.mediaType === 'image' || asset.type === 'image');
  const fallbackAsset = firstVideo || firstImage || null;
  return scenes.map((scene, index) => {
    const sceneAssetId = idList(scene.selectedAssetIds)[0] || assetId(fallbackAsset);
    const sceneSliceId = idList(scene.selectedAssetSliceIds)[0] || slices.find((slice) => slice.assetId === sceneAssetId)?.id || null;
    return {
      id: `clip_${uuidv4()}`,
      order: index + 1,
      sceneId: scene.id || scene.sceneId || null,
      assetId: scene.generatedVideoUrl ? null : sceneAssetId || null,
      sliceId: scene.generatedVideoUrl ? null : sceneSliceId,
      sourceUrl: scene.generatedVideoUrl || '',
      mediaType: scene.generatedVideoUrl ? 'video' : (fallbackAsset?.mediaType || fallbackAsset?.type || 'image'),
      startTime: 0,
      endTime: normalizeDuration(scene.duration || scene.durationSeconds, 3),
      duration: normalizeDuration(scene.duration || scene.durationSeconds, 3),
      fitMode: 'cover',
      transitionIn: index === 0 ? 'cut' : 'quick_cut',
      transitionOut: 'cut',
      caption: scene.subtitle || scene.subtitleText || '',
      subtitle: '',
      voiceover: '',
      reason: scene.generatedVideoUrl ? 'Use generated storyboard video output.' : 'Fallback match from selected storyboard asset or first available project asset.',
      role: scene.sceneRole || 'smart_editing_fallback',
    };
  }).filter((clip) => clip.sourceUrl || clip.assetId);
}

function normalizeSeed2Clips(rawClips = [], scenes = [], assetsById, slicesById, fallback = []) {
  const bySceneId = new Map(scenes.map((scene, index) => [String(scene.id || scene.sceneId || `scene_${index + 1}`), scene]));
  return rawClips.map((clip, index) => {
    const scene = bySceneId.get(String(clip.sceneId || '')) || scenes[index] || {};
    const assetIdValue = assetsById.has(clip.assetId) ? clip.assetId : idList(scene.selectedAssetIds)[0] || fallback[index]?.assetId || null;
    const sliceIdValue = slicesById.has(clip.sliceId) ? clip.sliceId : idList(scene.selectedAssetSliceIds)[0] || fallback[index]?.sliceId || null;
    const duration = normalizeDuration(clip.duration, scene.duration || scene.durationSeconds || fallback[index]?.duration || 3);
    return {
      id: clip.id || `clip_${uuidv4()}`,
      order: Number(clip.order || index + 1),
      sceneId: scene.id || scene.sceneId || clip.sceneId || null,
      assetId: scene.generatedVideoUrl ? null : assetIdValue,
      sliceId: scene.generatedVideoUrl ? null : sliceIdValue,
      sourceUrl: scene.generatedVideoUrl || '',
      mediaType: scene.generatedVideoUrl ? 'video' : '',
      startTime: Number.isFinite(Number(clip.startTime)) ? Number(clip.startTime) : 0,
      endTime: Number.isFinite(Number(clip.endTime)) ? Number(clip.endTime) : duration,
      duration,
      fitMode: clip.fitMode === 'contain' ? 'contain' : 'cover',
      transitionIn: clip.transitionIn || (index === 0 ? 'cut' : 'quick_cut'),
      transitionOut: clip.transitionOut || 'cut',
      caption: shortText(clip.captionDraft || clip.caption || scene.subtitle || scene.subtitleText || '', 220),
      subtitle: '',
      voiceover: '',
      reason: shortText(clip.reason || fallback[index]?.reason || 'Seed2 matched this clip to the storyboard scene.', 360),
      role: scene.sceneRole || clip.role || 'smart_editing',
    };
  }).filter((clip) => clip.sourceUrl || clip.assetId);
}

function normalizeDrafts(value = [], clips = [], key = 'text') {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => ({
    clipId: clips[index]?.id || item.clipId || null,
    clipIndex: Number(item.clipIndex || index + 1),
    text: shortText(item[key] || item.text || '', 260),
  })).filter((item) => item.text);
}

function captionDraftsFromClips(clips = []) {
  return clips.map((clip, index) => ({
    clipId: clip.id,
    clipIndex: index + 1,
    text: shortText(clip.caption || clip.reason || '', 260),
  })).filter((item) => item.text);
}

async function buildSmartEditingPlan(projectId, payload = {}, options = {}) {
  const project = await getProject(projectId).catch(() => null);
  const script = await getScript(projectId).catch(() => null);
  const storyboard = await getStoryboard(projectId).catch(() => null);
  const assets = await listAllAssets(projectId);
  const slices = (await searchSlices(projectId, {})).items || [];
  const scenes = Array.isArray(payload.scenes) && payload.scenes.length
    ? payload.scenes
    : Array.isArray(storyboard?.scenes) && storyboard.scenes.length
      ? storyboard.scenes
      : script?.scenes || [];
  const targetDuration = Number(payload.targetDuration || storyboard?.totalDuration || script?.totalDuration || project?.expectedDuration || 15);
  const fallback = fallbackClips(scenes, assets, slices);
  const assetsById = new Set(assets.map(assetId).filter(Boolean));
  const slicesById = new Set(slices.map((slice) => slice.id).filter(Boolean));

  let raw = null;
  let provider = 'seed2';
  let planningError = null;
  try {
    raw = await (options.generateJsonWithSeed2 || generateJsonWithSeed2)({
      systemPrompt: [
        'You are a precise e-commerce smart editing planner.',
        'Use project-owned assets and slices only. Do not use public videos as footage.',
        'Create an editing plan that matches storyboard scenes to assets/slices, transitions, caption drafts, BGM recommendations, and missing scene requests.',
        'No TTS or dubbing audio is available. Voiceover must be text draft only.',
        'Do not require hard subtitles. Captions are drafts or sidecar subtitles only.',
        'Return strict JSON.',
      ].join('\n'),
      userPrompt: JSON.stringify({
        project,
        target: {
          duration: Math.min(15, targetDuration || 15),
          aspectRatio: payload.aspectRatio || storyboard?.aspectRatio || '9:16',
          subtitleMode: payload.subtitleMode || 'off',
          language: payload.language || 'en',
        },
        script: script ? {
          scriptId: script.scriptId || script.id,
          strategy: script.strategy,
          factors: script.factors,
          scenes: script.scenes,
        } : null,
        storyboard: storyboard ? {
          storyboardId: storyboard.storyboardId || storyboard.id,
          scenes: scenes.map(compactScene),
        } : { scenes: scenes.map(compactScene) },
        assets: assets.map(compactAsset).slice(0, 80),
        slices: slices.map(compactSlice).slice(0, 180),
        constraints: [
          'Default subtitleMode is off; do not force burned-in captions.',
          'Voiceover/dubbing is text-only draft because no TTS provider is available.',
          'Use uploaded BGM asset only if available; otherwise return style recommendation.',
          'Mark missingSceneRequests when owned assets cannot satisfy a storyboard scene.',
        ],
      }),
      schema: EDITING_PLAN_SCHEMA,
      temperature: 0,
      fetchImpl: options.fetchImpl,
    });
  } catch (error) {
    provider = 'fallback';
    planningError = error.message;
  }

  const clips = raw?.clips?.length ? normalizeSeed2Clips(raw.clips, scenes, assetsById, slicesById, fallback) : fallback;
  const totalDuration = Number(clips.reduce((sum, clip) => sum + Number(clip.duration || 0), 0).toFixed(1));
  const captionDrafts = normalizeDrafts(raw?.captionDrafts, clips);
  const finalCaptionDrafts = captionDrafts.length ? captionDrafts : captionDraftsFromClips(clips);
  const voiceoverDrafts = normalizeDrafts(raw?.voiceoverDrafts, clips);
  const usedAssetIds = [...new Set(clips.map((clip) => clip.assetId).filter(Boolean))];
  const usedAssetSliceIds = [...new Set(clips.map((clip) => clip.sliceId).filter(Boolean))];

  return {
    id: `editing_plan_${uuidv4()}`,
    projectId,
    mode: 'smart_editing',
    targetDuration: Math.min(15, targetDuration || 15),
    aspectRatio: payload.aspectRatio || storyboard?.aspectRatio || '9:16',
    clips,
    transitions: clips.map((clip) => ({ clipId: clip.id, in: clip.transitionIn, out: clip.transitionOut })),
    subtitles: finalCaptionDrafts.map((item) => ({ clipId: item.clipId, text: item.text, start: null, duration: clips[item.clipIndex - 1]?.duration || null })),
    captionDrafts: finalCaptionDrafts,
    voiceoverDrafts,
    audio: {
      bgm: payload.bgm || null,
      voiceover: null,
      ttsAvailable: false,
      bgmRecommendation: raw?.bgmRecommendation || { style: 'clean commerce bed', uploadedAssetId: '' },
    },
    missingSceneRequests: Array.isArray(raw?.missingSceneRequests) ? raw.missingSceneRequests : [],
    complianceNotes: Array.isArray(raw?.complianceNotes)
      ? raw.complianceNotes
      : ['Use only owned assets or AI-generated filler shots. Do not copy public video footage.', 'Captions are drafts unless exported as sidecar.'],
    renderSettings: {
      aspectRatio: payload.aspectRatio || storyboard?.aspectRatio || '9:16',
      width: 1080,
      height: 1920,
      fps: 30,
      format: 'mp4',
      maxDuration: 15,
      style: payload.style || project?.style || 'smart_ecommerce',
      language: payload.language || 'en',
      subtitleMode: payload.subtitleMode === 'sidecar' || payload.subtitleMode === 'burned_in_experimental' ? payload.subtitleMode : 'off',
      audioMode: payload.audioMode === 'silent' || payload.audioMode === 'uploaded_bgm' ? payload.audioMode : 'preserve_source',
      backgroundMusicMixMode: payload.backgroundMusicMixMode === 'replace_source' ? 'replace_source' : payload.backgroundMusicMixMode === 'mix_under_source' ? 'mix_under_source' : null,
      backgroundMusicVolume: Number.isFinite(Number(payload.backgroundMusicVolume)) ? Number(payload.backgroundMusicVolume) : null,
      preserveGeneratedDialogueAudio: payload.backgroundMusicMixMode !== 'replace_source',
      ttsEnabled: false,
    },
    usedAssetIds,
    usedAssetSliceIds,
    usedScriptId: script?.scriptId || script?.id || null,
    usedStoryboardId: storyboard?.storyboardId || storyboard?.id || null,
    agentPlan: {
      provider,
      model: raw?.model || null,
      planningError,
      noTts: true,
      hardSubtitlesDefault: false,
    },
    metadata: { duration: totalDuration, source: 'seed2_smart_editing_agent', planningError },
    createdAt: now(),
  };
}

module.exports = {
  EDITING_PLAN_SCHEMA,
  buildSmartEditingPlan,
  fallbackClips,
};
