const {
  listAllAssets,
  listAssets,
  createAssetFromUpload,
  appendAsset,
  getAsset,
  updateAsset,
  deleteAsset,
  analyzeAsset,
  getAssetSlices,
  searchProjectAssets,
  buildMockAnalysis,
  normalizeLegacyAssetType,
} = require('./asset.service');

async function listMaterials(projectId, query) {
  if (query && Object.keys(query).length > 0) {
    return listAssets(projectId, query);
  }
  return listAllAssets(projectId);
}

async function saveMaterial(projectId, file, typeOrPayload) {
  const payload = typeof typeOrPayload === 'object' && typeOrPayload !== null ? typeOrPayload : { type: typeOrPayload };
  return createAssetFromUpload(projectId, file, payload);
}

async function getMaterial(projectId, assetId) {
  return getAsset(projectId, assetId);
}

async function deleteMaterial(projectId, assetId) {
  return deleteAsset(projectId, assetId);
}

async function appendMaterial(projectId, asset) {
  return appendAsset(projectId, asset);
}

async function updateMaterial(projectId, assetId, payload) {
  return updateAsset(projectId, assetId, payload);
}

async function reanalyzeMaterial(projectId, assetId) {
  return analyzeAsset(projectId, assetId);
}

module.exports = {
  listMaterials,
  saveMaterial,
  getMaterial,
  deleteMaterial,
  appendMaterial,
  updateMaterial,
  reanalyzeMaterial,
  getAssetSlices,
  searchProjectAssets,
  buildMockAnalysis,
  normalizeAssetType: normalizeLegacyAssetType,
};
