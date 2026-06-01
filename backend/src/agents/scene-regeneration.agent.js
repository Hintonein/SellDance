const modelProvider = require('../services/model-provider.service');
const { regenerateScriptScene } = require('../services/script.service');

async function runSceneRegenerationAgent(projectId, input = {}, options = {}) {
  if (options.preview) return modelProvider.regenerateScriptScene(input, options);
  return regenerateScriptScene(projectId, input.scriptId, input.sceneId, input);
}

module.exports = { runSceneRegenerationAgent };
