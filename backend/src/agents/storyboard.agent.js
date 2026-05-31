const modelProvider = require('../services/model-provider.service');
const { generateAndSaveStoryboard } = require('../services/storyboard.service');

async function runStoryboardAgent(projectId, input = {}, options = {}) {
  if (options.preview) return modelProvider.generateStoryboard({ ...input, projectId }, options);
  return generateAndSaveStoryboard(projectId, input);
}

module.exports = { runStoryboardAgent };
