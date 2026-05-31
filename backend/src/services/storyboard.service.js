const { v4: uuidv4 } = require('uuid');
const { readStoryboard, writeStoryboard } = require('./storage.service');
const { getScript } = require('./script.service');
const { buildAssetRequirements, matchAssetsForScene } = require('./scene-asset-matching.service');

function now() {
  return new Date().toISOString();
}

function clampDuration(value, fallback = 3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(6, Number(parsed.toFixed(1))));
}

function normalizeIdList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (!value) return [];
  return [String(value).trim()].filter(Boolean);
}

function editableFields() {
  return [
    'duration',
    'visualDescription',
    'cameraMovement',
    'subtitle',
    'voiceover',
    'bgm',
    'selectedAssetIds',
    'selectedAssetSliceIds',
    'generationPrompt',
  ];
}

function sceneFromScriptScene(scriptScene = {}, storyboardId, scriptId, index = 0) {
  const duration = clampDuration(scriptScene.duration, 3);
  const id = scriptScene.storyboardSceneId || `storyboard_scene_${uuidv4()}`;
  const base = {
    id,
    sceneId: id,
    scriptId,
    storyboardId,
    scriptSceneId: scriptScene.id,
    index,
    order: index + 1,
    sceneOrder: index + 1,
    sceneIndex: index + 1,
    sceneRole: scriptScene.sceneRole || 'selling_point',
    sellingPoint: scriptScene.sellingPoint || '',
    duration,
    durationSeconds: duration,
    visualDescription: scriptScene.visualDescription || '',
    cameraMovement: scriptScene.cameraMovement || 'steady push-in',
    cameraMotion: scriptScene.cameraMovement || 'steady push-in',
    subtitle: scriptScene.subtitle || scriptScene.voiceover || '',
    subtitleText: scriptScene.subtitle || scriptScene.voiceover || '',
    voiceover: scriptScene.voiceover || '',
    scriptText: scriptScene.voiceover || scriptScene.subtitle || '',
    narration: scriptScene.voiceover || '',
    bgm: scriptScene.bgm || 'clean commerce bed',
    bgmHint: scriptScene.bgm || 'clean commerce bed',
    assetRequirements: buildAssetRequirements(scriptScene),
    candidateAssets: [],
    candidateSlices: [],
    selectedAssetIds: [],
    selectedAssetSliceIds: [],
    generationPrompt: `Create a ${scriptScene.sceneRole || 'selling_point'} shot: ${scriptScene.visualDescription || scriptScene.voiceover || ''}`,
    editableFields: editableFields(),
    layout: 'cover',
    transition: index === 0 ? 'cut' : 'quick_cut',
    status: 'ready',
  };
  return base;
}

async function enrichSceneWithRecall(projectId, scene) {
  const match = await matchAssetsForScene(projectId, scene);
  return {
    ...scene,
    assetRequirements: match.assetRequirements,
    candidateAssets: match.candidateAssets,
    candidateSlices: match.candidateSlices,
    selectedAssetIds: normalizeIdList(scene.selectedAssetIds).length ? normalizeIdList(scene.selectedAssetIds) : match.selectedAssetIds,
    selectedAssetSliceIds: normalizeIdList(scene.selectedAssetSliceIds).length ? normalizeIdList(scene.selectedAssetSliceIds) : match.selectedAssetSliceIds,
    fallbackReason: match.fallbackReason,
  };
}

function normalizeStoryboardScene(scene = {}, storyboardId, scriptId, index = 0) {
  const duration = clampDuration(scene.duration ?? scene.durationSeconds, 3);
  const id = scene.id || scene.sceneId || `storyboard_scene_${uuidv4()}`;
  return {
    ...scene,
    id,
    sceneId: scene.sceneId || id,
    scriptId: scene.scriptId || scriptId || null,
    storyboardId: scene.storyboardId || storyboardId || null,
    index: Number(scene.index ?? index),
    order: Number(scene.order ?? scene.sceneOrder ?? index + 1),
    sceneOrder: Number(scene.sceneOrder ?? scene.order ?? index + 1),
    sceneIndex: Number(scene.sceneIndex ?? scene.index ?? index),
    sceneRole: scene.sceneRole || scene.role || 'selling_point',
    duration,
    durationSeconds: duration,
    visualDescription: scene.visualDescription || scene.scriptText || '',
    cameraMovement: scene.cameraMovement || scene.cameraMotion || 'steady push-in',
    cameraMotion: scene.cameraMovement || scene.cameraMotion || 'steady push-in',
    subtitle: scene.subtitle || scene.subtitleText || '',
    subtitleText: scene.subtitleText || scene.subtitle || '',
    voiceover: scene.voiceover || scene.narration || scene.scriptText || '',
    narration: scene.voiceover || scene.narration || scene.scriptText || '',
    bgm: scene.bgm || scene.bgmHint || 'clean commerce bed',
    bgmHint: scene.bgm || scene.bgmHint || 'clean commerce bed',
    assetRequirements: buildAssetRequirements(scene),
    candidateAssets: Array.isArray(scene.candidateAssets) ? scene.candidateAssets : [],
    candidateSlices: Array.isArray(scene.candidateSlices) ? scene.candidateSlices : [],
    selectedAssetIds: normalizeIdList(scene.selectedAssetIds || scene.assetRefs),
    selectedAssetSliceIds: normalizeIdList(scene.selectedAssetSliceIds),
    generationPrompt: scene.generationPrompt || `Create shot: ${scene.visualDescription || scene.subtitle || ''}`,
    editableFields: Array.isArray(scene.editableFields) ? scene.editableFields : editableFields(),
    layout: scene.layout || 'cover',
    transition: scene.transition || 'cut',
    status: scene.status || 'ready',
  };
}

function normalizeStoryboard(projectId, payload = {}, existing = null) {
  const scenes = (payload.scenes || []).map((scene, index) => normalizeStoryboardScene(scene, payload.id || existing?.id, payload.scriptId || existing?.scriptId, index));
  const totalDuration = Number(scenes.reduce((sum, scene) => sum + Number(scene.duration || 0), 0).toFixed(1));
  const id = payload.id || existing?.id || `storyboard_${uuidv4()}`;
  return {
    id,
    storyboardId: payload.storyboardId || id,
    projectId,
    scriptId: payload.scriptId || existing?.scriptId || null,
    scenes,
    totalDuration,
    aspectRatio: payload.aspectRatio || existing?.aspectRatio || '9:16',
    status: payload.status || existing?.status || 'ready',
    source: payload.source || existing?.source || 'manual',
    createdAt: payload.createdAt || existing?.createdAt || now(),
    updatedAt: now(),
  };
}

async function getStoryboard(projectId) {
  const storyboard = await readStoryboard(projectId);
  return storyboard ? normalizeStoryboard(projectId, storyboard, storyboard) : null;
}

async function listStoryboards(projectId) {
  const storyboard = await getStoryboard(projectId);
  return storyboard ? [storyboard] : [];
}

async function saveStoryboard(projectId, scenesOrPayload, source = 'manual') {
  const existing = await getStoryboard(projectId);
  const payload = Array.isArray(scenesOrPayload) ? { ...(existing || {}), scenes: scenesOrPayload, source } : { ...(existing || {}), ...(scenesOrPayload || {}), source };
  const normalized = normalizeStoryboard(projectId, payload, existing);
  await writeStoryboard(projectId, normalized);
  return normalized;
}

async function generateAndSaveStoryboard(projectId, input = {}) {
  const payload = typeof input === 'string' ? { scriptText: input } : (input || {});
  let script = null;
  if (payload.scriptId) script = await getScript(projectId);
  if (!script) script = await getScript(projectId);
  let scriptScenes = Array.isArray(payload.scenes) && payload.scenes.length
    ? payload.scenes
    : (script?.scenes || []);
  if (!scriptScenes.length && payload.scriptText) {
    const lines = String(payload.scriptText).split(/\n|(?<=[.!?。！？])\s+/).map((line) => line.trim()).filter(Boolean);
    lines.forEach((line, index) => {
      scriptScenes.push({
        id: `legacy_script_scene_${index + 1}`,
        sceneRole: index === 0 ? 'hook' : index === lines.length - 1 ? 'cta' : 'selling_point',
        duration: 3,
        voiceover: line,
        subtitle: line,
        visualDescription: `Product-focused shot for: ${line}`,
      });
    });
  }
  const storyboardId = `storyboard_${uuidv4()}`;
  const baseScenes = scriptScenes.map((scene, index) => sceneFromScriptScene(scene, storyboardId, script?.id || script?.scriptId || payload.scriptId || null, index));
  const enriched = [];
  for (const scene of baseScenes) {
    enriched.push(await enrichSceneWithRecall(projectId, scene));
  }
  const storyboard = normalizeStoryboard(projectId, {
    id: storyboardId,
    storyboardId,
    scriptId: script?.id || script?.scriptId || payload.scriptId || null,
    scenes: enriched,
    aspectRatio: payload.aspectRatio || '9:16',
    source: 'mock-ai-asset-recall',
  });
  await writeStoryboard(projectId, storyboard);
  return storyboard;
}

async function generateStoryboard(projectId, payload = {}) {
  return generateAndSaveStoryboard(projectId, payload);
}

async function updateScene(projectId, storyboardId, sceneId, payload = {}) {
  const storyboard = await getStoryboard(projectId);
  if (!storyboard || (storyboardId && ![storyboard.id, storyboard.storyboardId].includes(storyboardId))) return null;
  const scenes = storyboard.scenes.map((scene, index) => {
    const matches = scene.id === sceneId || scene.sceneId === sceneId || String(scene.order) === String(sceneId) || String(scene.sceneOrder) === String(sceneId);
    return matches ? normalizeStoryboardScene({ ...scene, ...payload }, storyboard.id, storyboard.scriptId, index) : scene;
  });
  return saveStoryboard(projectId, { ...storyboard, scenes }, 'manual-scene-edit');
}

async function regenerateScene(projectId, storyboardId, sceneId, payload = {}) {
  const storyboard = await getStoryboard(projectId);
  if (!storyboard || (storyboardId && ![storyboard.id, storyboard.storyboardId].includes(storyboardId))) return null;
  const target = storyboard.scenes.find((scene) => scene.id === sceneId || scene.sceneId === sceneId || String(scene.order) === String(sceneId));
  if (!target) return null;
  const prompt = payload.prompt || payload.refinePrompt || '';
  const regenerated = {
    ...target,
    ...payload,
    visualDescription: payload.visualDescription || `${target.visualDescription} Refined for: ${prompt || 'scene regeneration'}.`,
    voiceover: payload.voiceover || target.voiceover,
    subtitle: payload.subtitle || target.subtitle,
    status: 'regenerated',
  };
  const enriched = await enrichSceneWithRecall(projectId, regenerated);
  return updateScene(projectId, storyboardId, sceneId, enriched);
}

module.exports = {
  getStoryboard,
  listStoryboards,
  generateStoryboard,
  updateScene,
  regenerateScene,
  saveStoryboard,
  generateAndSaveStoryboard,
  normalizeStoryboard,
  normalizeStoryboardScene,
};
