const { getAsset } = require('./asset.service');
const { generateStoryboardSceneAsset } = require('./asset-generation.service');
const { languageInstruction } = require('./language-policy.service');

const MAX_SCENE_CONCURRENCY = 5;
const DEFAULT_SCENE_CONCURRENCY = 3;

function clampSceneConcurrency(value) {
  const parsed = Number(value || DEFAULT_SCENE_CONCURRENCY);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SCENE_CONCURRENCY;
  return Math.max(1, Math.min(MAX_SCENE_CONCURRENCY, Math.floor(parsed)));
}

function sceneId(scene, index = 0) {
  return scene.id || scene.sceneId || `scene_${index + 1}`;
}

function sceneDuration(scene) {
  const parsed = Number(scene.duration || scene.durationSeconds || 3);
  if (!Number.isFinite(parsed) || parsed <= 0) return 3;
  return Math.max(1, Math.min(6, Number(parsed.toFixed(1))));
}

function shortText(value, max = 1200) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function noCopyAssetEnvironmentPrompt() {
  return 'Use product/reference images only to understand product identity, package shape, label, color, and proportions. Do not copy the reference asset background, room, tabletop, lighting, camera angle, pose, layout, or composition. The environment, action, camera, and composition must follow this storyboard scene.';
}

function storyboardConsistencyPrompt(consistency = {}) {
  if (!consistency || typeof consistency !== 'object') return '';
  return [
    consistency.productIdentity ? `Global product identity: ${consistency.productIdentity}` : '',
    consistency.brandVisualStyle ? `Global brand visual style: ${consistency.brandVisualStyle}` : '',
    consistency.worldSetting ? `World setting rule: ${consistency.worldSetting}` : '',
    consistency.characterContinuity ? `Continuity rule: ${consistency.characterContinuity}` : '',
    consistency.cameraLanguage ? `Camera continuity: ${consistency.cameraLanguage}` : '',
    Array.isArray(consistency.doNotCopyFromAssets) && consistency.doNotCopyFromAssets.length
      ? `Never copy these reference-asset traits: ${consistency.doNotCopyFromAssets.join(', ')}.`
      : '',
  ].filter(Boolean).join('\n');
}

function buildScenePrompt(scene, index, payload = {}) {
  const plannedPrompt = scene.seedancePrompt || scene.generationPrompt || '';
  const consistency = payload.storyboardConsistency || scene.storyboardConsistency || {};
  const dialogueLanguage = scene.dialogueLanguage || payload.dialogueLanguage || 'en';
  const spokenDialogue = scene.spokenDialogue || scene.voiceover || scene.narration || scene.scriptText || '';
  const commonRules = [
    storyboardConsistencyPrompt(consistency),
    scene.sceneContinuityNotes ? `Scene continuity notes: ${scene.sceneContinuityNotes}` : '',
    scene.sceneDiversityInstruction ? `Scene diversity instruction: ${scene.sceneDiversityInstruction}` : '',
    `Target spoken dialogue language: ${dialogueLanguage}.`,
    languageInstruction(dialogueLanguage),
    spokenDialogue ? `Spoken dialogue to generate as audible speech: "${spokenDialogue}". Keep the sentence in ${dialogueLanguage}; do not mix Chinese and English except exact product or brand names.` : '',
    noCopyAssetEnvironmentPrompt(),
    'Follow the storyboard script exactly. Do not replace the product category, packaging, label, color, or main product identity.',
  ].filter(Boolean);
  if (plannedPrompt) {
    return shortText([
      plannedPrompt,
      scene.negativePrompt ? `Avoid: ${scene.negativePrompt}` : '',
      Array.isArray(scene.productConsistencyRules) && scene.productConsistencyRules.length
        ? `Product consistency rules: ${scene.productConsistencyRules.join(' ')}`
        : '',
      ...commonRules,
      'Vary composition, camera angle, background, and action across scenes while keeping the same product recognizable.',
    ].filter(Boolean).join('\n'), 1800);
  }
  return shortText([
    `Generate a vertical e-commerce storyboard video clip for scene ${index + 1}.`,
    `Aspect ratio: ${payload.aspectRatio || '9:16'}. Duration: ${sceneDuration(scene)} seconds.`,
    `Scene role: ${scene.sceneRole || 'selling_point'}.`,
    scene.sellingPoint ? `Selling point: ${scene.sellingPoint}.` : '',
    scene.narrativeGoal ? `Narrative goal: ${scene.narrativeGoal}.` : '',
    scene.visualDescription ? `Visual direction: ${scene.visualDescription}.` : '',
    scene.cameraMovement ? `Camera movement: ${scene.cameraMovement}.` : '',
    scene.voiceover ? `Voiceover meaning: ${scene.voiceover}.` : '',
    scene.subtitle ? `Subtitle: ${scene.subtitle}.` : '',
    scene.bgm ? `BGM cue: ${scene.bgm}.` : '',
    ...commonRules,
    'Create original footage. Do not copy public videos. Keep product claims visually plausible and compliant.',
  ].filter(Boolean).join('\n'), 1800);
}

async function buildReferenceImages(projectId, scene) {
  const refs = [];
  const assetIds = [
    scene.primaryProductAssetId,
    ...(scene.sourceReferenceAssetIds || []),
    ...(scene.selectedAssetIds || []),
  ].filter(Boolean);
  for (const assetId of assetIds) {
    const asset = await getAsset(projectId, assetId);
    if (!asset) continue;
    const isImage = asset.mediaType === 'image' || asset.type === 'image' || String(asset.mimeType || '').startsWith('image/');
    if (isImage) {
      refs.push({ role: assetId === scene.primaryProductAssetId ? 'product_reference' : 'reference', assetId: asset.id });
      break;
    }
  }
  if (!refs.length) {
    const selected = new Set([...(scene.sourceReferenceSliceIds || []), ...(scene.selectedAssetSliceIds || [])]);
    const slice = (scene.candidateSlices || []).find((item) => selected.has(item.id) && item.thumbnailUrl)
      || (scene.candidateSlices || []).find((item) => item.thumbnailUrl);
    if (slice?.thumbnailUrl) refs.push({ role: 'reference', url: slice.thumbnailUrl, name: slice.id });
  }
  return refs.slice(0, 1);
}

async function runConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function next() {
    const index = cursor;
    cursor += 1;
    if (index >= items.length) return;
    results[index] = await worker(items[index], index);
    await next();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return results;
}

async function generateStoryboardSceneVideos(projectId, storyboard, payload = {}, hooks = {}) {
  const scenes = Array.isArray(storyboard.scenes) ? storyboard.scenes : [];
  const concurrency = clampSceneConcurrency(payload.sceneConcurrency);
  const promptPayload = {
    ...payload,
    storyboardConsistency: payload.storyboardConsistency || storyboard.storyboardConsistency || null,
  };
  const running = new Map();
  const generatedAssetIds = [];
  const generatedOutputIds = [];
  const failedSceneIds = [];
  const sceneResults = [];
  let completedScenes = 0;
  let failedScenes = 0;

  const onProgress = hooks.onProgress || (async () => {});
  const generateSceneAsset = hooks.generateSceneAsset || generateStoryboardSceneAsset;

  const nextScenes = await runConcurrent(scenes, concurrency, async (scene, index) => {
    const id = sceneId(scene, index);
    running.set(id, { sceneId: id, order: scene.order || index + 1 });
    await onProgress({
      totalScenes: scenes.length,
      completedScenes,
      failedScenes,
      runningScenes: running.size,
      currentSceneIds: Array.from(running.keys()),
      sceneResults,
      message: `Generating storyboard scene ${index + 1}`,
    });
    try {
      const referenceImages = await buildReferenceImages(projectId, scene);
      const generationPrompt = buildScenePrompt(scene, index, promptPayload);
      const requestedDurationSec = sceneDuration(scene);
      const generated = await generateSceneAsset(projectId, {
        prompt: generationPrompt,
        durationSec: requestedDurationSec,
        ratio: promptPayload.aspectRatio || storyboard.aspectRatio || '9:16',
        assetType: 'storyboard_video',
        referenceImages,
        persistToAssetLibrary: false,
        classification: {
          provider: scene.seed2PlanningProvider || 'storyboard_scene_planner',
          model: scene.seed2PlanningModel || null,
          assetName: `Storyboard scene ${scene.order || index + 1}`,
          category: scene.sceneRole || 'storyboard_video',
          summary: scene.scriptAlignmentNotes || scene.visualDescription || '',
          tags: ['storyboard_video', scene.sceneRole || 'scene'].filter(Boolean),
          riskTags: ['AI generated storyboard video', 'verify product consistency and claims'],
          enhancedPrompt: generationPrompt,
        },
        metadata: {
          storyboardId: storyboard.storyboardId || storyboard.id,
          storyboardSceneId: id,
          scriptId: storyboard.scriptId,
          scriptVersionId: storyboard.scriptVersionId,
        },
      }, hooks.assetGenerationOptions || {});
      completedScenes += 1;
      running.delete(id);
      const assetId = generated.asset?.isProjectAsset ? (generated.asset?.assetId || generated.asset?.id) : null;
      const outputId = generated.output?.outputId || generated.output?.id || generated.asset?.outputId || null;
      if (assetId) generatedAssetIds.push(assetId);
      if (outputId) generatedOutputIds.push(outputId);
      const result = {
        sceneId: id,
        status: 'ready',
        generatedAssetId: assetId,
        generatedOutputId: outputId,
        generatedVideoUrl: generated.output?.fileUrl || generated.output?.url || generated.asset?.fileUrl || generated.asset?.url || generated.remoteUrl || '',
        remoteTaskId: generated.remoteTaskId,
        model: generated.model,
        requestedDurationSec,
        seedanceDurationSec: generated.durationSec || null,
      };
      sceneResults.push(result);
      await onProgress({
        totalScenes: scenes.length,
        completedScenes,
        failedScenes,
        runningScenes: running.size,
        currentSceneIds: Array.from(running.keys()),
        sceneResults,
        message: `Storyboard scene ${index + 1} generated`,
      });
      return {
        ...scene,
        generationStatus: 'ready',
        generationPrompt,
        generatedAssetId: assetId,
        generatedOutputId: outputId,
        generatedVideoUrl: result.generatedVideoUrl,
        seedanceTaskId: generated.remoteTaskId || null,
        requestedDurationSec,
        seedanceDurationSec: generated.durationSec || null,
        generationDurationNote: generated.durationSec && generated.durationSec !== requestedDurationSec
          ? `Seedance generated ${generated.durationSec}s; editor should trim to ${requestedDurationSec}s.`
          : null,
        referenceAssetIds: referenceImages.map((item) => item.assetId).filter(Boolean),
        primaryProductAssetId: scene.primaryProductAssetId || null,
        mustShowProductInFrame: scene.mustShowProductInFrame !== false,
        sceneContinuityNotes: scene.sceneContinuityNotes || null,
        sceneDiversityInstruction: scene.sceneDiversityInstruction || null,
        sourceReferenceAssetIds: scene.sourceReferenceAssetIds || scene.selectedAssetIds || [],
        sourceReferenceSliceIds: scene.sourceReferenceSliceIds || scene.selectedAssetSliceIds || [],
        selectedAssetIds: scene.selectedAssetIds || [],
        selectedAssetSliceIds: scene.selectedAssetSliceIds || [],
        generationError: null,
        provider: 'seedance_1_5_pro_video',
        model: generated.model,
      };
    } catch (error) {
      failedScenes += 1;
      running.delete(id);
      failedSceneIds.push(id);
      const result = { sceneId: id, status: 'failed', error: error.message };
      sceneResults.push(result);
      await onProgress({
        totalScenes: scenes.length,
        completedScenes,
        failedScenes,
        runningScenes: running.size,
        currentSceneIds: Array.from(running.keys()),
        sceneResults,
        message: `Storyboard scene ${index + 1} failed: ${error.message}`,
      });
      return {
        ...scene,
        generationStatus: 'failed',
        generationError: error.message,
        provider: 'seedance_1_5_pro_video',
      };
    }
  });

  return {
    scenes: nextScenes,
    generatedAssetIds,
    generatedOutputIds,
    failedSceneIds,
    sceneResults,
    completedScenes,
    failedScenes,
    totalScenes: scenes.length,
    concurrency,
    status: failedScenes === 0 ? 'completed' : (generatedAssetIds.length || generatedOutputIds.length) ? 'partial' : 'failed',
  };
}

module.exports = {
  MAX_SCENE_CONCURRENCY,
  DEFAULT_SCENE_CONCURRENCY,
  clampSceneConcurrency,
  buildScenePrompt,
  generateStoryboardSceneVideos,
  runConcurrent,
};
