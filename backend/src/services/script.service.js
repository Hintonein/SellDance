const { generateScript } = require('./ai-script.service');
const { readScript, writeScript } = require('./storage.service');

async function getScript(projectId) {
  return readScript(projectId);
}

async function saveScript(projectId, scriptText, meta = {}) {
  const payload = {
    projectId,
    scriptText,
    ...meta,
    updatedAt: new Date().toISOString(),
  };
  await writeScript(projectId, payload);
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
