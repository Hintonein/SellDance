const path = require('path');
const { SCRIPTS_DIR } = require('../config/paths');
const { generateScript } = require('./ai-script.service');
const { readJson, writeJson } = require('./storage.service');

function scriptFilePath(projectId) {
  return path.join(SCRIPTS_DIR, `${projectId}.json`);
}

async function getScript(projectId) {
  return readJson(scriptFilePath(projectId));
}

async function saveScript(projectId, scriptText, meta = {}) {
  const payload = {
    projectId,
    scriptText,
    ...meta,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(scriptFilePath(projectId), payload);
  return payload;
}

async function generateAndSaveScript(projectId, input) {
  const scriptText = generateScript(input);
  return saveScript(projectId, scriptText, { input, source: 'mock-ai' });
}

module.exports = {
  getScript,
  saveScript,
  generateAndSaveScript,
};
