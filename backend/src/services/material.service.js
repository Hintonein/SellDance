const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { ASSETS_DIR } = require('../config/paths');
const { readJson, writeJson } = require('./storage.service');

function assetsFilePath(projectId) {
  return path.join(ASSETS_DIR, `${projectId}.json`);
}

async function listMaterials(projectId) {
  return (await readJson(assetsFilePath(projectId), [])) || [];
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
  await writeJson(assetsFilePath(projectId), next);
  return asset;
}

module.exports = {
  listMaterials,
  saveMaterial,
};
