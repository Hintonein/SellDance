const { v4: uuidv4 } = require('uuid');
const { readAssets, writeAssets } = require('./storage.service');

async function listMaterials(projectId) {
  return (await readAssets(projectId, [])) || [];
}

async function saveMaterial(projectId, file, type) {
  const existing = await listMaterials(projectId);
  const asset = {
    id: uuidv4(),
    projectId,
    type: type || 'reference',
    originalName: file.originalname,
    filename: file.filename,
    mimeType: file.mimetype,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
  const next = [asset, ...existing];
  await writeAssets(projectId, next);
  return asset;
}

module.exports = {
  listMaterials,
  saveMaterial,
};
