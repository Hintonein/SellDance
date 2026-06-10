const { v4: uuidv4 } = require('uuid');
const { readStoryboard, writeStoryboard, deleteStoryboard: deleteStoryboardFile } = require('./storage.service');
const { getScript, getScriptVersion } = require('./script.service');
const { buildAssetRequirements, matchAssetsForScene } = require('./scene-asset-matching.service');
const { resolveDialogueLanguage } = require('./language-policy.service');

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

function sceneFromScriptScene(scriptScene = {}, storyboardId, scriptId, index = 0, languagePolicy = null) {
  const duration = clampDuration(scriptScene.duration, 3);
  const id = scriptScene.storyboardSceneId || `storyboard_scene_${uuidv4()}`;
  const role = scriptScene.sceneRole || 'selling_point';
  const visualDescription = scriptScene.visualDescription || scriptScene.narrativeGoal || scriptScene.voiceover || '';
  const voiceover = scriptScene.voiceover || scriptScene.narration || scriptScene.scriptText || '';
  const subtitle = scriptScene.subtitle || scriptScene.subtitleText || voiceover;
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
    sceneRole: role,
    sellingPoint: scriptScene.sellingPoint || '',
    narrativeGoal: scriptScene.narrativeGoal || '',
    duration,
    durationSeconds: duration,
    visualDescription,
    cameraMovement: scriptScene.cameraMovement || 'steady push-in',
    cameraMotion: scriptScene.cameraMovement || 'steady push-in',
    subtitle,
    subtitleText: subtitle,
    voiceover,
    scriptText: voiceover || subtitle,
    narration: voiceover,
    dialogueLanguage: scriptScene.dialogueLanguage || languagePolicy?.dialogueLanguage || 'en',
    languageReason: scriptScene.languageReason || languagePolicy?.languageReason || '',
    bgm: scriptScene.bgm || 'clean commerce bed',
    bgmHint: scriptScene.bgm || 'clean commerce bed',
    assetRequirements: buildAssetRequirements({ ...scriptScene, visualDescription }),
    candidateAssets: [],
    candidateSlices: [],
    selectedAssetIds: [],
    selectedAssetSliceIds: [],
    generationPrompt: [
      `Create a ${role} shot for storyboard scene ${index + 1}.`,
      scriptScene.sellingPoint ? `Selling point: ${scriptScene.sellingPoint}.` : '',
      visualDescription ? `Visual: ${visualDescription}.` : '',
      voiceover ? `Voiceover: ${voiceover}.` : '',
      subtitle ? `Subtitle: ${subtitle}.` : '',
    ].filter(Boolean).join(' '),
    editableFields: editableFields(),
    layout: 'cover',
    transition: index === 0 ? 'cut' : 'quick_cut',
    status: 'ready',
    constraints: scriptScene.constraints || {},
    style: scriptScene.style || '',
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

function diversifySceneSelection(scene, usedAssetIds, usedSliceIds) {
  const candidates = Array.isArray(scene.candidateAssets) ? scene.candidateAssets : [];
  if (!candidates.length) return scene;
  const preferred = candidates.find((item) => {
    const asset = item.asset || item;
    return asset?.id && !usedAssetIds.has(asset.id);
  }) || candidates[0];
  const asset = preferred.asset || preferred;
  if (!asset?.id) return scene;
  const candidateSlices = Array.isArray(scene.candidateSlices) ? scene.candidateSlices : [];
  const slice = candidateSlices.find((item) => item.assetId === asset.id && item.id && !usedSliceIds.has(item.id))
    || candidateSlices.find((item) => item.assetId === asset.id)
    || candidateSlices.find((item) => item.id && !usedSliceIds.has(item.id))
    || null;
  return {
    ...scene,
    selectedAssetIds: [asset.id],
    selectedAssetSliceIds: slice?.id ? [slice.id] : [],
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
    dialogueLanguage: scene.dialogueLanguage || 'en',
    languageReason: scene.languageReason || '',
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
    scriptVersionId: payload.scriptVersionId || existing?.scriptVersionId || null,
    scriptVersionNumber: payload.scriptVersionNumber || existing?.scriptVersionNumber || null,
    editingPlanId: payload.editingPlanId || existing?.editingPlanId || null,
    editingPlanStatus: payload.editingPlanStatus || existing?.editingPlanStatus || null,
    provider: payload.provider || existing?.provider || null,
    model: payload.model || existing?.model || null,
    storyboardConsistency: payload.storyboardConsistency || existing?.storyboardConsistency || null,
    dialogueLanguage: payload.dialogueLanguage || existing?.dialogueLanguage || scenes[0]?.dialogueLanguage || null,
    languageReason: payload.languageReason || existing?.languageReason || scenes[0]?.languageReason || null,
    generatedAssetIds: Array.isArray(payload.generatedAssetIds) ? payload.generatedAssetIds : (existing?.generatedAssetIds || []),
    generatedOutputIds: Array.isArray(payload.generatedOutputIds) ? payload.generatedOutputIds : (existing?.generatedOutputIds || []),
    generationWarnings: Array.isArray(payload.generationWarnings) ? payload.generationWarnings : (existing?.generationWarnings || []),
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
  const selectedVersion = script ? getScriptVersion(script, payload.scriptVersionId) : null;
  if (payload.scriptVersionId && script?.versions?.length && !selectedVersion) {
    const error = new Error('Script version not found for storyboard generation.');
    error.statusCode = 404;
    throw error;
  }
  let scriptScenes = Array.isArray(payload.scenes) && payload.scenes.length
    ? payload.scenes
    : (selectedVersion?.scenes || script?.scenes || []);
  const scriptText = payload.scriptText || selectedVersion?.scriptText || script?.scriptText || '';
  const languagePolicy = resolveDialogueLanguage({
    ...payload,
    productInfo: script?.productInfo || payload.productInfo,
    scenes: scriptScenes,
    scriptText,
  }, payload.language || payload.dialogueLanguage || script?.dialogueLanguage);
  if (!scriptScenes.length && payload.scriptText) {
    const lines = String(scriptText).split(/\n|(?<=[.!?。！？])\s+/).map((line) => line.trim()).filter(Boolean);
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
  const baseScenes = scriptScenes.map((scene, index) => sceneFromScriptScene(scene, storyboardId, script?.id || script?.scriptId || payload.scriptId || null, index, languagePolicy));
  const enriched = [];
  const usedAssetIds = new Set();
  const usedSliceIds = new Set();
  for (const scene of baseScenes) {
    const diversified = diversifySceneSelection(await enrichSceneWithRecall(projectId, scene), usedAssetIds, usedSliceIds);
    normalizeIdList(diversified.selectedAssetIds).forEach((id) => usedAssetIds.add(id));
    normalizeIdList(diversified.selectedAssetSliceIds).forEach((id) => usedSliceIds.add(id));
    enriched.push(diversified);
  }
  const storyboard = normalizeStoryboard(projectId, {
    id: storyboardId,
    storyboardId,
    scriptId: script?.id || script?.scriptId || payload.scriptId || null,
    scriptVersionId: payload.scriptVersionId || selectedVersion?.versionId || script?.selectedVersionId || null,
    scriptVersionNumber: selectedVersion?.versionNumber || null,
    editingPlanStatus: payload.createEditingPlan === false ? null : 'pending',
    scenes: enriched,
    dialogueLanguage: languagePolicy.dialogueLanguage,
    languageReason: languagePolicy.languageReason,
    aspectRatio: payload.aspectRatio || '9:16',
    source: 'storyboard-asset-recall',
  });
  await writeStoryboard(projectId, storyboard);
  return storyboard;
}

async function deleteStoryboard(projectId) {
  await deleteStoryboardFile(projectId);
  return { deleted: true };
}

async function generateStoryboard(projectId, payload = {}) {
  return generateAndSaveStoryboard(projectId, payload);
}

async function updateScene(projectId, storyboardId, sceneId, payload = {}) {
  const storyboard = await getStoryboard(projectId);
  if (!storyboard || (storyboardId && ![storyboard.id, storyboard.storyboardId].includes(storyboardId))) return null;
  let matched = false;
  const scenes = storyboard.scenes.map((scene, index) => {
    const matches = scene.id === sceneId || scene.sceneId === sceneId || String(scene.order) === String(sceneId) || String(scene.sceneOrder) === String(sceneId);
    if (matches) matched = true;
    return matches ? normalizeStoryboardScene({ ...scene, ...payload }, storyboard.id, storyboard.scriptId, index) : scene;
  });
  if (!matched) return null;
  return saveStoryboard(projectId, { ...storyboard, scenes, editingPlanStatus: storyboard.editingPlanId ? 'stale' : storyboard.editingPlanStatus }, 'manual-scene-edit');
}

function sceneMatchesId(scene, sceneId) {
  return scene.id === sceneId || scene.sceneId === sceneId || String(scene.order) === String(sceneId) || String(scene.sceneOrder) === String(sceneId);
}

function normalizeSceneOrder(scenes, storyboardId, scriptId) {
  return scenes.map((scene, index) => normalizeStoryboardScene({
    ...scene,
    index,
    order: index + 1,
    sceneOrder: index + 1,
    sceneIndex: index + 1,
  }, storyboardId, scriptId, index));
}

async function reorderScenes(projectId, storyboardId, sceneIds = []) {
  const storyboard = await getStoryboard(projectId);
  if (!storyboard || (storyboardId && ![storyboard.id, storyboard.storyboardId].includes(storyboardId))) return null;
  if (!Array.isArray(sceneIds) || sceneIds.length !== storyboard.scenes.length) {
    const error = new Error('sceneIds must include every storyboard scene exactly once.');
    error.statusCode = 400;
    throw error;
  }
  const seen = new Set();
  const ordered = sceneIds.map((sceneId) => {
    if (seen.has(sceneId)) {
      const error = new Error('sceneIds must not contain duplicates.');
      error.statusCode = 400;
      throw error;
    }
    seen.add(sceneId);
    return storyboard.scenes.find((scene) => sceneMatchesId(scene, sceneId));
  });
  if (ordered.some((scene) => !scene)) {
    const error = new Error('sceneIds contains an unknown storyboard scene.');
    error.statusCode = 400;
    throw error;
  }
  const scenes = normalizeSceneOrder(ordered, storyboard.id, storyboard.scriptId);
  return saveStoryboard(projectId, { ...storyboard, scenes, editingPlanStatus: storyboard.editingPlanId ? 'stale' : storyboard.editingPlanStatus }, 'manual-scene-reorder');
}

async function deleteScene(projectId, storyboardId, sceneId) {
  const storyboard = await getStoryboard(projectId);
  if (!storyboard || (storyboardId && ![storyboard.id, storyboard.storyboardId].includes(storyboardId))) return null;
  const nextScenes = storyboard.scenes.filter((scene) => !sceneMatchesId(scene, sceneId));
  if (nextScenes.length === storyboard.scenes.length) return null;
  const scenes = normalizeSceneOrder(nextScenes, storyboard.id, storyboard.scriptId);
  return saveStoryboard(projectId, { ...storyboard, scenes, editingPlanStatus: storyboard.editingPlanId ? 'stale' : storyboard.editingPlanStatus }, 'manual-scene-delete');
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
  reorderScenes,
  deleteScene,
  regenerateScene,
  deleteStoryboard,
  saveStoryboard,
  generateAndSaveStoryboard,
  normalizeStoryboard,
  normalizeStoryboardScene,
};
