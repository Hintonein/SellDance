const fs = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { UPLOADS_DIR } = require('../config/paths');
const { readAssets, writeAssets } = require('./storage.service');
const { buildMockAnalysis, buildMockSlices } = require('./asset-analysis.service');
const { searchAssets } = require('./asset-search.service');
const { createSlices, listSlices, getSlice, updateSlice, deleteSlice, deleteSlicesByAsset } = require('./asset-slice.service');

const canonicalTypes = new Set(['image', 'video', 'reference', 'ai_generated']);
const canonicalSources = new Set(['upload', 'url', 'ai', 'reference', 'mock']);
const legacyAssetTypes = new Set(['product_image', 'product_video', 'reference_image', 'reference_video', 'logo', 'other']);

function now() {
  return new Date().toISOString();
}

function parseTags(value) {
  if (Array.isArray(value)) return [...new Set(value.map((tag) => String(tag || '').trim()).filter(Boolean))];
  if (!value) return [];
  return [...new Set(String(value).split(',').map((tag) => tag.trim()).filter(Boolean))];
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { value: parsed };
    } catch {
      return { note: value };
    }
  }
  return {};
}

function inferMediaType(mimeType = '', requestedType = '') {
  if (requestedType === 'image' || requestedType === 'video') return requestedType;
  if (requestedType === 'reference_image' || requestedType === 'product_image' || requestedType === 'logo') return 'image';
  if (requestedType === 'reference_video' || requestedType === 'product_video') return 'video';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'other';
}

function inferCanonicalType({ requestedType, source, mimeType }) {
  if (canonicalTypes.has(requestedType)) return requestedType;
  if (source === 'ai' || source === 'mock' || source === 'ai_generated') return 'ai_generated';
  if (requestedType === 'reference' || requestedType === 'reference_image' || requestedType === 'reference_video') return 'reference';
  const mediaType = inferMediaType(mimeType, requestedType);
  if (mediaType === 'image' || mediaType === 'video') return mediaType;
  return null;
}

function normalizeSource(source, legacySource) {
  const value = source || legacySource || 'upload';
  if (value === 'uploaded') return 'upload';
  if (value === 'ai_generated') return 'ai';
  if (canonicalSources.has(value)) return value;
  return 'upload';
}

function normalizeLegacyAssetType(type = 'other', mimeType = '') {
  if (legacyAssetTypes.has(type)) return type;
  if (type === 'reference') return mimeType.startsWith('video/') ? 'reference_video' : 'reference_image';
  if (type === 'image') return 'product_image';
  if (type === 'video') return 'product_video';
  if (mimeType.startsWith('image/')) return 'product_image';
  if (mimeType.startsWith('video/')) return 'product_video';
  return 'other';
}

function normalizeAsset(projectId, raw = {}) {
  const timestamp = raw.createdAt || raw.uploadedAt || now();
  const mimeType = raw.mimeType || '';
  const source = normalizeSource(raw.source, raw.provider ? 'ai_generated' : undefined);
  const legacyType = raw.assetType || (legacyAssetTypes.has(raw.type) ? raw.type : undefined) || normalizeLegacyAssetType(raw.type, mimeType);
  const canonicalType = inferCanonicalType({ requestedType: raw.type, source, mimeType }) || inferCanonicalType({ requestedType: legacyType, source, mimeType }) || 'image';
  const mediaType = raw.mediaType || inferMediaType(mimeType, legacyType || canonicalType);
  const id = raw.id || raw.assetId || raw.materialId || uuidv4();
  const fileUrl = raw.fileUrl || raw.url || '';
  const title = raw.title || raw.name || raw.originalName || 'Untitled asset';
  const tags = parseTags(raw.tags || raw.analysis?.tags || []);
  return {
    ...raw,
    id,
    assetId: raw.assetId || id,
    materialId: raw.materialId || id,
    projectId: raw.projectId || projectId,
    type: canonicalType,
    assetType: legacyType,
    mediaType,
    source,
    title,
    name: raw.name || title,
    originalName: raw.originalName || title,
    description: raw.description || '',
    fileUrl,
    url: raw.url || fileUrl,
    filePath: raw.filePath || raw.storagePath || '',
    storagePath: raw.storagePath || raw.filePath || '',
    thumbnailUrl: raw.thumbnailUrl || fileUrl,
    mimeType,
    size: Number(raw.size || 0),
    duration: raw.duration === undefined ? null : Number(raw.duration || 0),
    tags,
    metadata: parseMetadata(raw.metadata),
    analysisStatus: raw.analysisStatus || (raw.analysis ? 'completed' : 'pending'),
    analysis: raw.analysis || null,
    slices: Array.isArray(raw.slices) ? raw.slices : [],
    uploadedAt: raw.uploadedAt || timestamp,
    createdAt: timestamp,
    updatedAt: raw.updatedAt || timestamp,
  };
}

function publicUploadPathToDisk(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return null;
  if (!fileUrl.startsWith('/uploads/')) return null;
  const relativePath = fileUrl.replace(/^\/uploads\//, '');
  if (!relativePath || relativePath.includes('..') || path.isAbsolute(relativePath)) return null;
  return path.join(UPLOADS_DIR, relativePath);
}

async function removeLocalUploadIfPresent(fileUrl) {
  const diskPath = publicUploadPathToDisk(fileUrl);
  if (!diskPath) return;
  try {
    await fs.unlink(diskPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function listAllAssets(projectId) {
  const rawAssets = await readAssets(projectId, []);
  return Array.isArray(rawAssets) ? rawAssets.map((asset) => normalizeAsset(projectId, asset)) : [];
}

async function writeNormalizedAssets(projectId, assets) {
  await writeAssets(projectId, assets.map((asset) => normalizeAsset(projectId, asset)));
}

const assetMutationQueues = new Map();

async function withAssetMutation(projectId, operation) {
  const key = String(projectId);
  const previous = assetMutationQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  assetMutationQueues.set(key, next);
  try {
    return await next;
  } finally {
    if (assetMutationQueues.get(key) === next) {
      assetMutationQueues.delete(key);
    }
  }
}


async function listAssets(projectId, query = {}) {
  const assets = await listAllAssets(projectId);
  return searchAssets(assets, {
    keyword: query.keyword,
    tag: query.tag,
    tags: query.tags,
    type: query.type,
    source: query.source,
    limit: query.limit,
    offset: query.offset,
  });
}

async function createAssetFromUpload(projectId, file, payload = {}) {
  if (!file) throw new Error('Please upload a file.');
  const source = normalizeSource(payload.source || 'upload');
  const canonicalType = inferCanonicalType({ requestedType: payload.type, source, mimeType: file.mimetype });
  if (!canonicalType || !['image', 'video', 'reference'].includes(canonicalType)) {
    await removeLocalUploadIfPresent(`/uploads/${file.filename}`);
    throw new Error(`Unsupported asset type or mimeType: ${payload.type || file.mimetype || 'unknown'}.`);
  }
  const timestamp = now();
  const title = payload.title || file.originalname || 'Uploaded asset';
  const asset = normalizeAsset(projectId, {
    id: uuidv4(),
    projectId,
    type: canonicalType,
    assetType: normalizeLegacyAssetType(payload.type || canonicalType, file.mimetype),
    mediaType: inferMediaType(file.mimetype, payload.type),
    source,
    title,
    description: payload.description || '',
    fileUrl: `/uploads/${file.filename}`,
    url: `/uploads/${file.filename}`,
    filePath: path.join('uploads', file.filename),
    storagePath: path.join('uploads', file.filename),
    thumbnailUrl: `/uploads/${file.filename}`,
    filename: file.filename,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    tags: parseTags(payload.tags),
    metadata: parseMetadata(payload.metadata),
    analysisStatus: 'pending',
    analysis: null,
    slices: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    uploadedAt: timestamp,
  });

  return withAssetMutation(projectId, async () => {
    const existing = await listAllAssets(projectId);
    try {
      await writeNormalizedAssets(projectId, [asset, ...existing]);
    } catch (error) {
      await removeLocalUploadIfPresent(asset.fileUrl);
      throw error;
    }
    return asset;
  });
}

async function appendAsset(projectId, asset) {
  return withAssetMutation(projectId, async () => {
    const existing = await listAllAssets(projectId);
    const normalized = normalizeAsset(projectId, asset);
    await writeNormalizedAssets(projectId, [normalized, ...existing]);
    return normalized;
  });
}

async function getAsset(projectId, assetId) {
  const assets = await listAllAssets(projectId);
  return assets.find((asset) => asset.id === assetId || asset.assetId === assetId || asset.materialId === assetId) || null;
}

async function updateAsset(projectId, assetId, payload = {}) {
  return withAssetMutation(projectId, async () => {
      const assets = await listAllAssets(projectId);
      const index = assets.findIndex((asset) => asset.id === assetId || asset.assetId === assetId || asset.materialId === assetId);
      if (index === -1) return null;
      const existing = assets[index];
      const allowed = {};
      if (payload.title !== undefined) allowed.title = String(payload.title || '').trim() || existing.title;
      if (payload.description !== undefined) allowed.description = String(payload.description || '');
      if (payload.type !== undefined) {
        const canonicalType = inferCanonicalType({ requestedType: payload.type, source: existing.source, mimeType: existing.mimeType });
        if (!canonicalTypes.has(canonicalType)) throw new Error(`Unsupported asset type: ${payload.type}`);
        allowed.type = canonicalType;
        allowed.assetType = normalizeLegacyAssetType(payload.type, existing.mimeType);
        allowed.mediaType = inferMediaType(existing.mimeType, payload.type);
      }
      if (payload.source !== undefined) allowed.source = normalizeSource(payload.source);
      if (payload.tags !== undefined) allowed.tags = parseTags(payload.tags);
      if (payload.metadata !== undefined) allowed.metadata = parseMetadata(payload.metadata);
      const updated = normalizeAsset(projectId, {
        ...existing,
        ...allowed,
        updatedAt: now(),
      });
      assets[index] = updated;
      await writeNormalizedAssets(projectId, assets);
      return updated;
  });
}

async function deleteAsset(projectId, assetId) {
  return withAssetMutation(projectId, async () => {
      const assets = await listAllAssets(projectId);
      const target = assets.find((asset) => asset.id === assetId || asset.assetId === assetId || asset.materialId === assetId);
      if (!target) return null;
      const next = assets.filter((asset) => asset.id !== target.id && asset.assetId !== target.assetId && asset.materialId !== target.materialId);
      await removeLocalUploadIfPresent(target.fileUrl || target.url);
      if (target.thumbnailUrl && target.thumbnailUrl !== target.fileUrl && target.thumbnailUrl !== target.url) {
        await removeLocalUploadIfPresent(target.thumbnailUrl);
      }
      await deleteSlicesByAsset(projectId, target.id);
      await writeNormalizedAssets(projectId, next);
      return target;
  });
}

async function analyzeAsset(projectId, assetId) {
  return withAssetMutation(projectId, async () => {
      const assets = await listAllAssets(projectId);
      const index = assets.findIndex((asset) => asset.id === assetId || asset.assetId === assetId || asset.materialId === assetId);
      if (index === -1) return null;
      const processing = normalizeAsset(projectId, { ...assets[index], analysisStatus: 'processing', updatedAt: now() });
      assets[index] = processing;
      await writeNormalizedAssets(projectId, assets);
    
      try {
        // Mock only in Phase 1. Real Seed 2.0 multimodal analysis belongs to Phase 5.
        const analyzed = normalizeAsset(projectId, {
          ...processing,
          analysisStatus: 'completed',
          analysis: buildMockAnalysis(processing),
          tags: parseTags([...(processing.tags || []), ...((buildMockAnalysis(processing).tags) || [])]),
          slices: [],
          updatedAt: now(),
        });
        assets[index] = analyzed;
        await createSlices(projectId, analyzed.id, buildMockSlices(processing));
        await writeNormalizedAssets(projectId, assets);
        return { ...analyzed, slices: (await listSlices(projectId, analyzed.id)).items };
      } catch (error) {
        const failed = normalizeAsset(projectId, {
          ...processing,
          analysisStatus: 'failed',
          analysisError: error.message,
          updatedAt: now(),
        });
        assets[index] = failed;
        await writeNormalizedAssets(projectId, assets);
        return failed;
      }
  });
}

async function getAssetSlices(projectId, assetId) {
  const asset = await getAsset(projectId, assetId);
  if (!asset) return null;
  const independent = await listSlices(projectId, asset.id);
  if (independent.total > 0) return independent;
  const legacyItems = Array.isArray(asset.slices) ? asset.slices : [];
  return { items: legacyItems, total: legacyItems.length, legacy: legacyItems.length > 0 };
}

async function getAssetSlice(projectId, assetId, sliceId) {
  const asset = await getAsset(projectId, assetId);
  if (!asset) return null;
  return getSlice(projectId, asset.id, sliceId);
}

async function updateAssetSlice(projectId, assetId, sliceId, payload) {
  const asset = await getAsset(projectId, assetId);
  if (!asset) return null;
  return updateSlice(projectId, asset.id, sliceId, payload);
}

async function deleteAssetSlice(projectId, assetId, sliceId) {
  const asset = await getAsset(projectId, assetId);
  if (!asset) return null;
  return deleteSlice(projectId, asset.id, sliceId);
}


async function recallAssets(projectId, input = {}) {
  if (Array.isArray(input.embeddingQuery) && input.embeddingQuery.length > 0) {
    const error = new Error('Embedding recall is reserved for Phase 2 and is not implemented in Phase 1.5.');
    error.statusCode = 501;
    throw error;
  }
  const result = await searchProjectAssets(projectId, { ...input, limit: input.limit || 10 });
  const items = [];
  for (const [index, asset] of result.items.entries()) {
    const sliceResult = await getAssetSlices(projectId, asset.id);
    const tagMatches = (input.tags || []).filter((tag) => (asset.tags || []).includes(tag)).length;
    const keywordHit = input.keyword && JSON.stringify([asset.title, asset.description, asset.analysis]).toLowerCase().includes(String(input.keyword).toLowerCase());
    items.push({
      asset,
      slices: sliceResult?.items || [],
      score: Math.max(0.3, 0.95 - index * 0.08 + tagMatches * 0.03 + (keywordHit ? 0.05 : 0)),
      reason: input.purpose ? `Matched for ${input.purpose} using Phase 1.5 keyword/tag/type recall.` : 'Matched using Phase 1.5 keyword/tag/type recall.',
    });
  }
  return { items, total: items.length, mode: 'keyword_tag_mock' };
}

async function searchProjectAssets(projectId, filters = {}) {
  if (Array.isArray(filters.embeddingQuery) && filters.embeddingQuery.length > 0) {
    const error = new Error('Embedding search is reserved for Phase 2 and is not implemented in Phase 1.');
    error.statusCode = 501;
    throw error;
  }
  const assets = await listAllAssets(projectId);
  return searchAssets(assets, filters);
}

module.exports = {
  normalizeAsset,
  normalizeLegacyAssetType,
  buildMockAnalysis,
  listAllAssets,
  listAssets,
  createAssetFromUpload,
  appendAsset,
  getAsset,
  updateAsset,
  deleteAsset,
  analyzeAsset,
  getAssetSlices,
  getAssetSlice,
  updateAssetSlice,
  deleteAssetSlice,
  recallAssets,
  searchProjectAssets,
};
