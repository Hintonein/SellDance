const { buildMockAnalysis } = require('./asset-analysis.service');
const { generateScript } = require('./ai-script.service');
const { buildStoryboard } = require('./storyboard-matcher.service');
const { generateAssetWithVolcengine } = require('./volcengine-ark.service');
const { analyzeAssetWithSeed2 } = require('../providers/volcengine/seed2.client');
const { normalizeTags } = require('./asset-tag.service');
const { normalizeScript, normalizeScriptScene } = require('./script.service');
const { buildAssetRequirements } = require('./scene-asset-matching.service');

function disabled(name) {
  const error = new Error(name + ' provider is disabled or reserved for a later phase.');
  error.statusCode = 501;
  return error;
}

function normalizeAssetAnalysis(raw = {}, asset = {}) {
  const mock = buildMockAnalysis(asset);
  const tags = normalizeTags([
    ...(raw.tags || []),
    ...(raw.product?.tags || []),
    ...(raw.sellingPoints || []),
    ...(raw.usageScenarios || []),
    ...(raw.visualStyle || []),
    ...(raw.parseWarning ? ['analysis_parse_warning'] : []),
    ...(raw.provider === 'seed2' ? [] : (mock.tags || [])),
  ]);
  return {
    subject: raw.subject || raw.product?.subject || mock.product?.subject,
    category: raw.category || raw.product?.category || mock.product?.category,
    colors: Array.isArray(raw.colors) ? raw.colors : (raw.visual?.colors || mock.visual?.colors || []),
    material: Array.isArray(raw.material) ? raw.material : [],
    sellingPoints: Array.isArray(raw.sellingPoints) ? raw.sellingPoints : [],
    usageScenarios: Array.isArray(raw.usageScenarios) ? raw.usageScenarios : [],
    visualStyle: Array.isArray(raw.visualStyle) ? raw.visualStyle : [],
    summary: raw.summary || raw.video?.overallSummary || mock.summary,
    product: raw.product || {
      subject: raw.subject || mock.product?.subject,
      category: raw.category || mock.product?.category,
      colors: Array.isArray(raw.colors) ? raw.colors : [],
      material: Array.isArray(raw.material) ? raw.material : [],
      sellingPoints: Array.isArray(raw.sellingPoints) ? raw.sellingPoints : [],
      usageScenarios: Array.isArray(raw.usageScenarios) ? raw.usageScenarios : [],
    },
    visual: raw.visual || {
      style: Array.isArray(raw.visualStyle) ? raw.visualStyle.join(', ') : mock.visual?.style,
      colors: Array.isArray(raw.colors) ? raw.colors : (mock.visual?.colors || []),
    },
    tags,
    suggestedUseCases: raw.suggestedUseCases || mock.suggestedUseCases,
    embedding: Array.isArray(raw.embedding) ? raw.embedding : (Array.isArray(mock.embedding) ? mock.embedding : null),
    vector: Array.isArray(raw.vector) ? raw.vector : (Array.isArray(raw.embedding) ? raw.embedding : mock.vector),
    provider: raw.provider || 'mock',
    model: raw.model || 'mock-asset-analysis-v1',
    video: raw.video || null,
    sliceSuggestions: Array.isArray(raw.sliceSuggestions) ? raw.sliceSuggestions : [],
    rawText: raw.rawText ? String(raw.rawText).slice(0, 4000) : undefined,
    parseWarning: raw.parseWarning || null,
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

function assertSeed2Configured() {
  if (!process.env.ARK_API_KEY || !process.env.SEED_ENDPOINT_ID) {
    const error = new Error('Seed 2.0 script/storyboard provider requires ARK_API_KEY and SEED_ENDPOINT_ID.');
    error.statusCode = 400;
    error.code = 'MISSING_SEED2_ENV';
    throw error;
  }
}

async function generateScriptProvider(input) { return generateScript(input); }
async function generateStructuredScript(input = {}, options = {}) {
  const provider = options.provider || process.env.AI_SCRIPT_PROVIDER || 'mock';
  if (provider === 'seed2') assertSeed2Configured();
  return normalizeScript(input.projectId || 'preview_project', {
    ...input,
    source: provider === 'seed2' ? 'seed2-placeholder' : 'mock-script-provider',
  });
}

async function generateStoryboard(input = {}, options = {}) {
  const provider = options.provider || process.env.AI_STORYBOARD_PROVIDER || 'mock';
  if (provider === 'seed2') assertSeed2Configured();
  const scenes = Array.isArray(input.scenes) && input.scenes.length
    ? input.scenes.map((scene, index) => ({
        ...scene,
        id: scene.id || `provider_storyboard_scene_${index + 1}`,
        index,
        order: index + 1,
        assetRequirements: buildAssetRequirements(scene),
      }))
    : buildStoryboard(input.scriptText || '', input.assets || []);
  return { provider, scenes };
}

async function analyzeReferenceVideo(input = {}, options = {}) {
  const provider = options.provider || process.env.AI_REFERENCE_ANALYSIS_PROVIDER || 'mock';
  if (provider === 'seed2') assertSeed2Configured();
  return {
    provider,
    sourceUrl: input.sourceUrl || '',
    sourceDeclaration: input.sourceDeclaration || 'Structured analysis only; original third-party video is not downloaded or reused.',
    hook: input.hook || 'Open with a fast product benefit and clear first-frame subject.',
    sellingPoints: Array.isArray(input.sellingPoints) ? input.sellingPoints : ['visible product proof', 'simple CTA'],
    storyboard: input.storyboard || [
      { role: 'hook', duration: 2, method: 'fast benefit reveal' },
      { role: 'usage_demo', duration: 5, method: 'show product in context' },
      { role: 'cta', duration: 2, method: 'brand/product end card' },
    ],
    style: input.style || 'clean_ecommerce',
    reusableFactors: input.reusableFactors || ['fast hook', 'detail proof', 'direct CTA'],
    summary: input.summary || 'Mock structured reference analysis for script/template reuse.',
  };
}

async function mineCreativeTemplate(input = {}, options = {}) {
  const provider = options.provider || process.env.AI_TEMPLATE_PROVIDER || 'mock';
  if (provider === 'seed2') assertSeed2Configured();
  const reports = input.referenceReports || input.references || [];
  const category = input.category || reports[0]?.category || 'general';
  return {
    provider,
    name: input.name || `${category} commerce proof template`,
    category,
    strategy: input.strategy || 'Hook with immediate benefit, prove through product detail/usage, close with direct CTA.',
    factors: input.factors || ['first-frame product benefit', 'macro detail proof', 'usage context', 'clean end card'],
    constraints: input.constraints || ['max 15 seconds', 'avoid unverifiable claims', 'do not copy third-party video content'],
    exampleReferenceVideoIds: input.exampleReferenceVideoIds || reports.map((item) => item.id).filter(Boolean),
  };
}

async function regenerateScriptScene(input = {}, options = {}) {
  const provider = options.provider || process.env.AI_SCRIPT_PROVIDER || 'mock';
  if (provider === 'seed2') assertSeed2Configured();
  return normalizeScriptScene({
    ...(input.scene || {}),
    ...input.patch,
    visualDescription: input.patch?.visualDescription || `${input.scene?.visualDescription || ''} ${input.prompt || 'Refined scene.'}`.trim(),
  }, input.index || 0, input.context || {});
}

async function planEditing(input) { return { provider: 'mock', mode: input.mode || 'asset_first', steps: [] }; }
async function generateVideo(input, options = {}) {
  if ((options.provider || process.env.AI_VIDEO_PROVIDER) === 'seedance') return generateAssetWithVolcengine({ ...input, mediaType: 'video' });
  return { provider: 'mock', status: 'placeholder', message: 'Mock video provider placeholder.' };
}
async function generateImage() { throw disabled('Image generation'); }

module.exports = {
  analyzeAsset,
  analyzeAssetSlice,
  recallAssets: recallAssetsProvider,
  generateScript: generateScriptProvider,
  generateStructuredScript,
  generateStoryboard,
  analyzeReferenceVideo,
  mineCreativeTemplate,
  regenerateScriptScene,
  planEditing,
  generateVideo,
  generateImage,
  normalizeAssetAnalysis,
};
