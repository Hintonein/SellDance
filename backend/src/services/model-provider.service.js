const { buildMockAnalysis } = require('./asset-analysis.service');
const { generateScript } = require('./ai-script.service');
const { buildStoryboard } = require('./storyboard-matcher.service');
const { recallAssets } = require('./asset.service');
const { generateAssetWithVolcengine } = require('./volcengine-ark.service');

function disabled(name) { const error = new Error(`${name} provider is disabled or reserved for a later phase.`); error.statusCode = 501; return error; }
async function analyzeAsset(asset, options = {}) { return { ...buildMockAnalysis(asset), provider: options.provider || process.env.AI_ANALYSIS_PROVIDER || 'mock' }; }
async function analyzeAssetSlice(slice) { return { provider: 'mock', summary: `Mock slice analysis for ${slice.id}`, tags: slice.tags || [] }; }
async function recallAssetsProvider(input, options = {}) { return recallAssets(options.projectId || input.projectId, input); }
async function generateScriptProvider(input) { return generateScript(input); }
async function generateStoryboard(input) { return { provider: 'mock', scenes: buildStoryboard(input.scriptText || '', input.assets || []) }; }
async function planEditing(input) { return { provider: 'mock', mode: input.mode || 'asset_first', steps: [] }; }
async function generateVideo(input, options = {}) {
  if ((options.provider || process.env.AI_VIDEO_PROVIDER) === 'seedance') return generateAssetWithVolcengine({ ...input, mediaType: 'video' });
  return { provider: 'mock', status: 'placeholder', message: 'Mock video provider placeholder.' };
}
async function generateImage() { throw disabled('Image generation'); }
module.exports = { analyzeAsset, analyzeAssetSlice, recallAssets: recallAssetsProvider, generateScript: generateScriptProvider, generateStoryboard, planEditing, generateVideo, generateImage };
