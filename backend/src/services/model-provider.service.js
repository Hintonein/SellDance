const { buildMockAnalysis } = require('./asset-analysis.service');
const { generateScript } = require('./ai-script.service');
const { buildStoryboard } = require('./storyboard-matcher.service');
const { generateAssetWithVolcengine } = require('./volcengine-ark.service');
const { analyzeAssetWithSeed2 } = require('../providers/volcengine/seed2.client');
const { normalizeTags } = require('./asset-tag.service');

function disabled(name) {
  const error = new Error(name + ' provider is disabled or reserved for a later phase.');
  error.statusCode = 501;
  return error;
}

function normalizeAssetAnalysis(raw = {}, asset = {}) {
  const mock = buildMockAnalysis(asset);
  const tags = normalizeTags([...(raw.tags || []), ...(raw.product?.tags || []), ...(mock.tags || [])]);
  return {
    summary: raw.summary || mock.summary,
    product: raw.product || mock.product,
    visual: raw.visual || mock.visual,
    tags,
    suggestedUseCases: raw.suggestedUseCases || mock.suggestedUseCases,
    embedding: Array.isArray(raw.embedding) ? raw.embedding : (Array.isArray(mock.embedding) ? mock.embedding : null),
    vector: Array.isArray(raw.vector) ? raw.vector : (Array.isArray(raw.embedding) ? raw.embedding : mock.vector),
    provider: raw.provider || 'mock',
    model: raw.model || 'mock-asset-analysis-v1',
    videoMetadata: raw.videoMetadata || asset.metadata?.video || null,
  };
}

async function analyzeAsset(asset, options = {}) {
  const provider = options.provider || process.env.AI_ASSET_ANALYSIS_PROVIDER || process.env.AI_ANALYSIS_PROVIDER || 'mock';
  if (provider === 'seed2') {
    const result = await analyzeAssetWithSeed2(asset, options);
    return normalizeAssetAnalysis(result, asset);
  }
  return normalizeAssetAnalysis({ ...buildMockAnalysis(asset), provider: 'mock' }, asset);
}

async function analyzeAssetSlice(slice) {
  return { provider: 'mock', summary: 'Mock slice analysis for ' + slice.id, tags: slice.tags || [] };
}

async function recallAssetsProvider(input, options = {}) {
  const { recallAssets } = require('./asset.service');
  return recallAssets(options.projectId || input.projectId, input);
}

async function generateScriptProvider(input) { return generateScript(input); }
async function generateStoryboard(input) { return { provider: 'mock', scenes: buildStoryboard(input.scriptText || '', input.assets || []) }; }
async function planEditing(input) { return { provider: 'mock', mode: input.mode || 'asset_first', steps: [] }; }
async function generateVideo(input, options = {}) {
  if ((options.provider || process.env.AI_VIDEO_PROVIDER) === 'seedance') return generateAssetWithVolcengine({ ...input, mediaType: 'video' });
  return { provider: 'mock', status: 'placeholder', message: 'Mock video provider placeholder.' };
}
async function generateImage() { throw disabled('Image generation'); }

module.exports = { analyzeAsset, analyzeAssetSlice, recallAssets: recallAssetsProvider, generateScript: generateScriptProvider, generateStoryboard, planEditing, generateVideo, generateImage, normalizeAssetAnalysis };
