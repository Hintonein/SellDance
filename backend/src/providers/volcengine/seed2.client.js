function seed2Config() {
  return {
    apiKey: process.env.SEED2_API_KEY || process.env.ARK_API_KEY || '',
    endpointId: process.env.SEED2_ENDPOINT_ID || process.env.SEED_ENDPOINT_ID || process.env.SEED_CLASSIFICATION_ENDPOINT_ID || '',
    model: process.env.SEED2_MODEL || '',
    baseUrl: process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com',
  };
}

function missingSeed2ConfigError() {
  const error = new Error('AI_ASSET_ANALYSIS_PROVIDER=seed2 requires SEED2_API_KEY or ARK_API_KEY plus SEED2_ENDPOINT_ID or SEED_ENDPOINT_ID. Configure .env or switch AI_ASSET_ANALYSIS_PROVIDER=mock.');
  error.statusCode = 400;
  error.code = 'SEED2_CONFIG_MISSING';
  return error;
}

async function analyzeAssetWithSeed2(asset, options = {}) {
  const config = seed2Config();
  if (!config.apiKey || !config.endpointId) throw missingSeed2ConfigError();
  const error = new Error('Seed 2.0 multimodal asset analysis provider boundary is ready, but the exact production request format is not confirmed in this codebase yet. Keep AI_ASSET_ANALYSIS_PROVIDER=mock for local development or implement the provider client here.');
  error.statusCode = 501;
  error.code = 'SEED2_PROVIDER_TODO';
  error.provider = 'seed2';
  error.endpointId = config.endpointId;
  error.assetId = asset?.id;
  error.frameUrls = options.frameUrls || [];
  throw error;
}

module.exports = { seed2Config, analyzeAssetWithSeed2, missingSeed2ConfigError };
