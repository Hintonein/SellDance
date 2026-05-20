const { buildStoryboard } = require('./storyboard-matcher.service');
const { listMaterials } = require('./material.service');
const { readStoryboard, writeStoryboard } = require('./storage.service');

async function getStoryboard(projectId) {
  return readStoryboard(projectId);
}

async function saveStoryboard(projectId, scenes, source = 'manual') {
  const payload = {
    projectId,
    source,
    scenes,
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
