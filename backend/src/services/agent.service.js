const modelProvider = require('./model-provider.service');
const { getAsset, analyzeAsset } = require('./asset.service');
const { createEditingPlan } = require('./creation-planning.service');
const { runScriptAgent } = require('../agents/script.agent');
const { runStoryboardAgent } = require('../agents/storyboard.agent');
const { runReferenceAnalysisAgent } = require('../agents/reference-analysis.agent');
const { runTemplateMiningAgent } = require('../agents/template-mining.agent');
const { runSceneRegenerationAgent } = require('../agents/scene-regeneration.agent');
const { runConstraintCheckAgent } = require('../agents/constraint-check.agent');
async function runAssetAnalysisAgent(projectId, assetId, options = {}) {
  const asset = await getAsset(projectId, assetId);
  if (!asset) return null;
  if (options.persist !== false) return analyzeAsset(projectId, assetId);
  return modelProvider.analyzeAsset(asset, options);
}
async function runCreationPlanningAgent(projectId, input) { return createEditingPlan(projectId, input); }
module.exports = {
  runAssetAnalysisAgent,
  runScriptAgent,
  runStoryboardAgent,
  runCreationPlanningAgent,
  runReferenceAnalysisAgent,
  runTemplateMiningAgent,
  runSceneRegenerationAgent,
  runConstraintCheckAgent,
};
