const { buildStoryboard } = require('./storyboard-matcher.service');
const { listMaterials } = require('./material.service');
const { readStoryboard, writeStoryboard } = require('./storage.service');
const { normalizeScenes } = require('./storyboard-scene.service');

async function getStoryboard(projectId) {
  const storyboard = await readStoryboard(projectId);
  if (!storyboard) return null;
  return {
    ...storyboard,
    scenes: normalizeScenes(storyboard.scenes || []),
  };
}

async function saveStoryboard(projectId, scenes, source = 'manual') {
  const normalizedScenes = normalizeScenes(scenes);
  const payload = {
    id: projectId,
    storyboardId: projectId,
    projectId,
    source,
    scenes: normalizedScenes,
    totalDuration: normalizedScenes.reduce((sum, scene) => sum + Number(scene.durationSeconds || 0), 0),
    updatedAt: new Date().toISOString(),
  };
  await writeStoryboard(projectId, payload);
  return payload;
}

async function generateAndSaveStoryboard(projectId, scriptText) {
  const materials = await listMaterials(projectId);
  const scenes = buildStoryboard(scriptText, materials);
  return saveStoryboard(projectId, scenes, 'mock-ai');
}


async function listStoryboards(projectId) {
  const storyboard = await getStoryboard(projectId);
  return storyboard ? [storyboard] : [];
}
async function generateStoryboard(projectId, payload = {}) {
  return generateAndSaveStoryboard(projectId, payload.scriptText || payload.text || '');
}
async function updateScene(projectId, _storyboardId, sceneId, payload = {}) {
  const storyboard = await getStoryboard(projectId);
  if (!storyboard) return null;
  const scenes = (storyboard.scenes || []).map((scene) => (scene.sceneId === sceneId || String(scene.sceneOrder) === String(sceneId) || String(scene.sceneIndex) === String(sceneId)) ? { ...scene, ...payload } : scene);
  return saveStoryboard(projectId, scenes, 'manual');
}
async function regenerateScene(projectId, storyboardId, sceneId, payload = {}) {
  return updateScene(projectId, storyboardId, sceneId, { ...payload, status: 'mock-regenerated' });
}

module.exports = {
  getStoryboard,
  listStoryboards,
  generateStoryboard,
  updateScene,
  regenerateScene,
  saveStoryboard,
  generateAndSaveStoryboard,
};
