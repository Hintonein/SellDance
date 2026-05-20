const path = require('path');
const { STORYBOARDS_DIR } = require('../config/paths');
const { buildStoryboard } = require('./storyboard-matcher.service');
const { listMaterials } = require('./material.service');
const { readJson, writeJson } = require('./storage.service');

function storyboardFilePath(projectId) {
  return path.join(STORYBOARDS_DIR, `${projectId}.json`);
}

async function getStoryboard(projectId) {
  return readJson(storyboardFilePath(projectId));
}

async function saveStoryboard(projectId, scenes, source = 'manual') {
  const payload = {
    projectId,
    source,
    scenes,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(storyboardFilePath(projectId), payload);
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
