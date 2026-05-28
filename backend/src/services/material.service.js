const { v4: uuidv4 } = require('uuid');
const { readAssets, writeAssets } = require('./storage.service');

const allowedAssetTypes = new Set([
  'product_image',
  'product_video',
  'reference_image',
  'reference_video',
  'logo',
  'other',
  'image',
  'video',
  'reference',
]);

function normalizeAssetType(type = 'other', mimeType = '') {
  if (allowedAssetTypes.has(type) && !['image', 'video', 'reference'].includes(type)) return type;
  if (type === 'image') return 'product_image';
  if (type === 'video') return 'product_video';
  if (type === 'reference') return mimeType.startsWith('video/') ? 'reference_video' : 'reference_image';
  if (mimeType.startsWith('image/')) return 'product_image';
  if (mimeType.startsWith('video/')) return 'product_video';
  return 'other';
}

function buildMockAnalysis({ originalName, type }) {
  const baseName = String(originalName || 'asset').replace(/\.[^.]+$/, '');
  const subject = type === 'logo' ? 'brand logo' : type.includes('video') ? 'product demo clip' : 'hero product';
  return {
    subject,
    category: 'mock commerce asset',
    colors: ['white', 'charcoal', 'accent blue'],
    scene: type.includes('reference') ? 'social commerce reference scene' : 'clean product showcase',
    style: type.includes('video') ? 'dynamic short video' : 'high-conversion product visual',
    tags: [subject, type.replace('_', '-'), baseName.toLowerCase(), 'mock-analysis'],
    summary: `${baseName} is analyzed as a ${subject} for ${type.replace('_', ' ')} usage.`,
    embedding: [0.12, 0.34, 0.56, 0.78],
    vector: [0.12, 0.34, 0.56, 0.78],
  };
}

async function listMaterials(projectId) {
  return (await readAssets(projectId, [])) || [];
}

async function saveMaterial(projectId, file, type) {
  const existing = await listMaterials(projectId);
  const normalizedType = normalizeAssetType(type, file.mimetype);
  const asset = {
    id: uuidv4(),
    assetId: uuidv4(),
    projectId,
    type: normalizedType,
    originalName: file.originalname,
    name: file.originalname,
    filename: file.filename,
    storagePath: `uploads/${file.filename}`,
    fileUrl: `/uploads/${file.filename}`,
    url: `/uploads/${file.filename}`,
    thumbnailUrl: `/uploads/${file.filename}`,
    mimeType: file.mimetype,
    size: file.size,
    analysis: buildMockAnalysis({ originalName: file.originalname, type: normalizedType }),
    uploadedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const next = [asset, ...existing];
  await writeAssets(projectId, next);
  return asset;
}

async function getMaterial(projectId, assetId) {
  const materials = await listMaterials(projectId);
  return materials.find((asset) => asset.id === assetId || asset.assetId === assetId) || null;
}

async function deleteMaterial(projectId, assetId) {
  const materials = await listMaterials(projectId);
  const next = materials.filter((asset) => asset.id !== assetId && asset.assetId !== assetId);
  await writeAssets(projectId, next);
  return next.length !== materials.length;
}

module.exports = {
  listMaterials,
  saveMaterial,
  getMaterial,
  deleteMaterial,
};
