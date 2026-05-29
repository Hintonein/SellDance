const modelProvider = require('./model-provider.service');
const { getAsset, analyzeAsset } = require('./asset.service');
const { generateAndSaveScript } = require('./script.service');
const { generateAndSaveStoryboard } = require('./storyboard.service');
const { createEditingPlan } = require('./creation-planning.service');
async function runAssetAnalysisAgent(projectId, assetId, options = {}) {
  const asset = await getAsset(projectId, assetId);
  if (!asset) return null;
  if (options.persist !== false) return analyzeAsset(projectId, assetId);
  return modelProvider.analyzeAsset(asset, options);
}
async function runScriptAgent(projectId, input, options = {}) { return options.preview ? modelProvider.generateScript(input, options) : generateAndSaveScript(projectId, input); }
async function runStoryboardAgent(projectId, input) { return generateAndSaveStoryboard(projectId, input.scriptText || ''); }
async function runCreationPlanningAgent(projectId, input) { return createEditingPlan(projectId, input); }
module.exports = { runAssetAnalysisAgent, runScriptAgent, runStoryboardAgent, runCreationPlanningAgent };
