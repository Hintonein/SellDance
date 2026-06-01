const { buildMockAnalysis } = require('../../services/asset-analysis.service');
module.exports = { analyzeAsset: async (asset) => buildMockAnalysis(asset), analyzeAssetSlice: async (slice) => ({ provider: 'mock', summary: slice.visualDescription, tags: slice.tags || [] }) };
