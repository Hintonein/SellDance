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

module.exports = {
  getStoryboard,
  saveStoryboard,
  generateAndSaveStoryboard,
};
