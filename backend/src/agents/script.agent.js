const modelProvider = require('../services/model-provider.service');
const { generateAndSaveScript } = require('../services/script.service');

async function runScriptAgent(projectId, input = {}, options = {}) {
  if (options.preview) return modelProvider.generateStructuredScript({ ...input, projectId }, options);
  return generateAndSaveScript(projectId, input);
}

module.exports = { runScriptAgent };
