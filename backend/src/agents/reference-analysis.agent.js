const modelProvider = require('../services/model-provider.service');
const { analyzeReferenceVideo } = require('../services/reference-video.service');

async function runReferenceAnalysisAgent(input = {}, options = {}) {
  if (input.id && options.persist !== false) return analyzeReferenceVideo(input.id, input);
  return modelProvider.analyzeReferenceVideo(input, options);
}

module.exports = { runReferenceAnalysisAgent };
