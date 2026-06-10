const fs = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { UPLOADS_DIR } = require('../config/paths');
const { readAssets, writeAssets } = require('./storage.service');
const { searchAssets, searchAssetMatches, buildRecallResult } = require('./asset-search.service');
const { createSlices, listSlices, getSlice, updateSlice, deleteSlice, deleteSlicesByAsset, searchSlices } = require('./asset-slice.service');
const { normalizeTags, mergeTags, normalizeTagFields, inferSystemTagsFromAsset, curateTags } = require('./asset-tag.service');
const { probeVideoMetadata, createBrowserVideoPreview, createVideoSlicesFromAsset } = require('./video-metadata.service');
const { sampleRepresentativeFrames, deleteSampledFramesByAsset } = require('./video-frame-sampling.service');
const {
  listProjectAssetLinks,
  linkAssetToProject,
  unlinkAssetFromProject,
  removeAssetFromAllProjects,
} = require('./project-asset-link.service');

const canonicalTypes = new Set(['image', 'video', 'audio', 'reference', 'ai_generated']);
const canonicalSources = new Set(['upload', 'url', 'ai', 'reference', 'mock']);
const legacyAssetTypes = new Set(['product_image', 'product_video', 'reference_image', 'reference_video', 'logo', 'other']);
const GLOBAL_ASSET_STORE_ID = 'global';

function now() { return new Date().toISOString(); }
function parseTags(value) { return normalizeTags(value); }
function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { value: parsed };
    } catch { return { note: value }; }
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
  if (mediaType === 'audio') return 'audio';
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
  if (type === 'audio' || mimeType.startsWith('audio/')) return 'other';
  if (mimeType.startsWith('image/')) return 'product_image';
  if (mimeType.startsWith('video/')) return 'product_video';
  return 'other';
}
function normalizeAudioMetadata(metadata = {}, raw = {}) {
  const existing = metadata.audio && typeof metadata.audio === 'object' && !Array.isArray(metadata.audio) ? metadata.audio : {};
  const requestedKind = raw.audioKind || raw.audioType || existing.kind || 'background_music';
  const kind = requestedKind === 'full_audio_voiceover' || requestedKind === 'voiceover_track' ? 'full_audio_voiceover' : 'background_music';
  const requestedMixMode = raw.backgroundMusicMixMode || raw.mixMode || existing.mixMode;
  const mixMode = requestedMixMode === 'replace_source' || kind === 'full_audio_voiceover' ? 'replace_source' : 'mix_under_source';
  const parsedVolume = Number(raw.backgroundMusicVolume ?? raw.volume ?? existing.recommendedVolume);
  const recommendedVolume = Number.isFinite(parsedVolume) && parsedVolume > 0
    ? Math.max(0.01, Math.min(1, Number(parsedVolume.toFixed(2))))
    : (mixMode === 'replace_source' ? 1 : 0.16);
  return {
    ...metadata,
    audio: {
      ...existing,
      kind,
      mixMode,
      containsVoiceover: mixMode === 'replace_source',
      recommendedVolume,
    },
  };
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
  const previewUrl = raw.previewUrl || raw.browserPreviewUrl || raw.metadata?.video?.previewUrl || '';
  const title = raw.title || raw.name || raw.originalName || 'Untitled asset';
  let metadata = parseMetadata(raw.metadata);
  if (mediaType === 'audio') metadata = normalizeAudioMetadata(metadata, raw);
  const analysis = raw.analysis ? {
    ...raw.analysis,
    tags: curateTags(raw.analysis.tags || []),
  } : null;
  const base = { ...raw, id, projectId: raw.projectId || projectId, type: canonicalType, assetType: legacyType, mediaType, source, analysisStatus: raw.analysisStatus || (analysis ? 'completed' : 'pending'), analysis };
  const tagFields = normalizeTagFields({ ...raw, systemTags: mergeTags(raw.systemTags, raw.analysis?.tags, inferSystemTagsFromAsset(base)) });
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
    previewUrl,
    browserPreviewUrl: raw.browserPreviewUrl || previewUrl,
    filePath: raw.filePath || raw.storagePath || '',
    storagePath: raw.storagePath || raw.filePath || '',
    thumbnailUrl: raw.thumbnailUrl || fileUrl,
    mimeType,
    size: Number(raw.size || 0),
    duration: raw.duration === undefined ? (metadata.video?.duration ?? null) : Number(raw.duration || 0),
    userTags: tagFields.userTags,
    systemTags: tagFields.systemTags,
    tags: tagFields.tags,
    metadata,
    analysisStatus: base.analysisStatus,
    analysis: base.analysis,
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
  try { await fs.unlink(diskPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
async function removeAssetLocalFiles(asset = {}) {
  await removeLocalUploadIfPresent(asset.fileUrl || asset.url);
  if (asset.previewUrl && asset.previewUrl !== asset.fileUrl && asset.previewUrl !== asset.url) {
    await removeLocalUploadIfPresent(asset.previewUrl);
  }
  if (asset.browserPreviewUrl && asset.browserPreviewUrl !== asset.previewUrl && asset.browserPreviewUrl !== asset.fileUrl && asset.browserPreviewUrl !== asset.url) {
    await removeLocalUploadIfPresent(asset.browserPreviewUrl);
  }
  if (asset.thumbnailUrl && asset.thumbnailUrl !== asset.fileUrl && asset.thumbnailUrl !== asset.url && asset.thumbnailUrl !== asset.previewUrl && asset.thumbnailUrl !== asset.browserPreviewUrl) {
    await removeLocalUploadIfPresent(asset.thumbnailUrl);
  }
}
async function listGlobalAssetRecords() {
  const rawAssets = await readAssets(GLOBAL_ASSET_STORE_ID, []);
  return Array.isArray(rawAssets)
    ? rawAssets.map((asset) => normalizeAsset(GLOBAL_ASSET_STORE_ID, { ...asset, projectId: GLOBAL_ASSET_STORE_ID }))
    : [];
}

async function writeGlobalAssetRecords(assets) {
  await writeAssets(
    GLOBAL_ASSET_STORE_ID,
    assets.map((asset) => normalizeAsset(GLOBAL_ASSET_STORE_ID, { ...asset, projectId: GLOBAL_ASSET_STORE_ID }))
  );
}

async function upsertGlobalAsset(asset) {
  const assets = await listGlobalAssetRecords();
  const normalized = normalizeAsset(GLOBAL_ASSET_STORE_ID, { ...asset, projectId: GLOBAL_ASSET_STORE_ID });
  const index = assets.findIndex((item) => item.id === normalized.id || item.assetId === normalized.assetId || item.materialId === normalized.materialId);
  const next = index === -1 ? [normalized, ...assets] : assets.map((item, itemIndex) => (itemIndex === index ? normalized : item));
  await writeGlobalAssetRecords(next);
  return normalized;
}

async function getGlobalAsset(assetId) {
  const assets = await listGlobalAssetRecords();
  return assets.find((asset) => asset.id === assetId || asset.assetId === assetId || asset.materialId === assetId) || null;
}

async function ensureLegacyProjectAssetsLinked(projectId) {
  if (!projectId || projectId === GLOBAL_ASSET_STORE_ID) return [];
  const links = await listProjectAssetLinks(projectId);
  const legacyAssets = await readAssets(projectId, []);
  if (!Array.isArray(legacyAssets) || legacyAssets.length === 0) return links;

  const globalAssets = await listGlobalAssetRecords();
  const globalIds = new Set(globalAssets.flatMap((asset) => [asset.id, asset.assetId, asset.materialId].filter(Boolean)));
  const nextGlobal = [...globalAssets];
  const nextLinks = [...links];
  const linkedIds = new Set(links.map((link) => link.assetId));
  let changedGlobal = false;
  let changedLinks = false;

  for (const raw of legacyAssets) {
    const normalized = normalizeAsset(GLOBAL_ASSET_STORE_ID, {
      ...raw,
      projectId: GLOBAL_ASSET_STORE_ID,
      originProjectId: raw.originProjectId || projectId,
    });
    if (!globalIds.has(normalized.id)) {
      nextGlobal.push(normalized);
      globalIds.add(normalized.id);
      changedGlobal = true;
    }
    if (!linkedIds.has(normalized.id)) {
      nextLinks.push({
        projectId,
        assetId: normalized.id,
        role: raw.role || 'candidate',
        selectedSliceIds: [],
        addedFrom: raw.source === 'ai' || raw.provider ? 'ai_generation' : 'legacy_project_asset',
        addedAt: raw.createdAt || raw.uploadedAt || now(),
        updatedAt: now(),
      });
      linkedIds.add(normalized.id);
      changedLinks = true;
    }
  }
  if (changedGlobal) await writeGlobalAssetRecords(nextGlobal);
  if (changedLinks) {
    for (const link of nextLinks) await linkAssetToProject(projectId, link.assetId, link);
  }
  return listProjectAssetLinks(projectId);
}

function attachProjectLink(projectId, asset, link) {
  return normalizeAsset(projectId, {
    ...asset,
    projectId,
    globalAssetId: asset.id,
    linkedProjectId: projectId,
    projectLink: link || null,
  });
}

async function listAllAssets(projectId) {
  if (!projectId || projectId === GLOBAL_ASSET_STORE_ID) return listGlobalAssetRecords();
  const links = await ensureLegacyProjectAssetsLinked(projectId);
  const linkedIds = new Set(links.map((link) => link.assetId));
  const linkByAssetId = new Map(links.map((link) => [link.assetId, link]));
  const assets = await listGlobalAssetRecords();
  return assets
    .filter((asset) => linkedIds.has(asset.id) || linkedIds.has(asset.assetId) || linkedIds.has(asset.materialId))
    .map((asset) => attachProjectLink(projectId, asset, linkByAssetId.get(asset.id) || linkByAssetId.get(asset.assetId) || linkByAssetId.get(asset.materialId)));
}

async function listGlobalAssets(query = {}) {
  return searchAssets(await listGlobalAssetRecords(), {
    keyword: query.keyword,
    tag: query.tag,
    tags: query.tags,
    type: query.type,
    source: query.source,
    mediaType: query.mediaType,
    analysisStatus: query.analysisStatus,
    limit: query.limit,
    offset: query.offset,
  });
}

async function writeNormalizedAssets(projectId, assets) {
  await writeGlobalAssetRecords(assets);
  if (projectId && projectId !== GLOBAL_ASSET_STORE_ID) {
    for (const asset of assets) await linkAssetToProject(projectId, asset.id || asset.assetId, { addedFrom: asset.source === 'ai' ? 'ai_generation' : 'library' });
  }
}
const assetMutationQueues = new Map();
async function withAssetMutation(projectId, operation) {
  const key = String(projectId);
  const previous = assetMutationQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  assetMutationQueues.set(key, next);
  try { return await next; } finally { if (assetMutationQueues.get(key) === next) assetMutationQueues.delete(key); }
}
async function listAssets(projectId, query = {}) {
  const assets = await listAllAssets(projectId);
  return searchAssets(assets, { keyword: query.keyword, tag: query.tag, tags: query.tags, type: query.type, source: query.source, mediaType: query.mediaType, analysisStatus: query.analysisStatus, limit: query.limit, offset: query.offset });
}
async function enrichUploadedVideoAsset(asset, filePath) {
  if (asset.mediaType !== 'video') return asset;
  const videoMetadata = await probeVideoMetadata(filePath);
  const browserPreview = await createBrowserVideoPreview({
    filePath,
    assetId: asset.id,
    mimeType: asset.mimeType,
    fileUrl: asset.fileUrl || asset.url,
    metadata: videoMetadata,
  });
  return normalizeAsset(asset.projectId, {
    ...asset,
    duration: videoMetadata.duration,
    previewUrl: browserPreview.previewUrl || asset.previewUrl || '',
    browserPreviewUrl: browserPreview.previewUrl || asset.browserPreviewUrl || '',
    metadata: {
      ...(asset.metadata || {}),
      video: {
        ...videoMetadata,
        browserPlayable: browserPreview.previewStatus === 'source_browser_playable',
        previewUrl: browserPreview.previewUrl || '',
        previewStatus: browserPreview.previewStatus,
        previewMimeType: browserPreview.previewMimeType,
        previewError: browserPreview.previewError || null,
      },
    },
    systemTags: mergeTags(asset.systemTags, ['video', 'product_video']),
  });
}
async function createAssetFromUpload(projectId, file, payload = {}) {
  if (!file) throw new Error('Please upload a file.');
  const source = normalizeSource(payload.source || 'upload');
  const canonicalType = inferCanonicalType({ requestedType: payload.type, source, mimeType: file.mimetype });
  if (!canonicalType || !['image', 'video', 'audio', 'reference'].includes(canonicalType)) {
    await removeLocalUploadIfPresent('/uploads/' + file.filename);
    throw new Error('Unsupported asset type or mimeType: ' + (payload.type || file.mimetype || 'unknown') + '.');
  }
  const timestamp = now();
  const title = payload.title || file.originalname || 'Uploaded asset';
  let asset = normalizeAsset(GLOBAL_ASSET_STORE_ID, {
    id: uuidv4(), projectId: GLOBAL_ASSET_STORE_ID, originProjectId: projectId, type: canonicalType, assetType: normalizeLegacyAssetType(payload.type || canonicalType, file.mimetype), mediaType: inferMediaType(file.mimetype, payload.type), source, title,
    description: payload.description || '', fileUrl: '/uploads/' + file.filename, url: '/uploads/' + file.filename, filePath: path.join('uploads', file.filename), storagePath: path.join('uploads', file.filename), thumbnailUrl: '/uploads/' + file.filename,
    filename: file.filename, originalName: file.originalname, mimeType: file.mimetype, size: file.size, userTags: parseTags(payload.tags), metadata: parseMetadata(payload.metadata), audioKind: payload.audioKind || payload.audioType, backgroundMusicMixMode: payload.backgroundMusicMixMode, backgroundMusicVolume: payload.backgroundMusicVolume, analysisStatus: 'pending', analysis: null, slices: [], createdAt: timestamp, updatedAt: timestamp, uploadedAt: timestamp,
  });
  try { asset = await enrichUploadedVideoAsset(asset, file.path); } catch (error) { await removeAssetLocalFiles(asset); throw error; }
  return withAssetMutation(GLOBAL_ASSET_STORE_ID, async () => {
    try {
      const globalAsset = await upsertGlobalAsset(asset);
      const link = await linkAssetToProject(projectId, globalAsset.id, { addedFrom: 'upload', role: payload.role || 'candidate' });
      return attachProjectLink(projectId, globalAsset, link);
    } catch (error) {
      await removeAssetLocalFiles(asset);
      throw error;
    }
  });
}
async function appendAsset(projectId, asset) {
  return withAssetMutation(GLOBAL_ASSET_STORE_ID, async () => {
    const normalized = normalizeAsset(GLOBAL_ASSET_STORE_ID, { ...asset, projectId: GLOBAL_ASSET_STORE_ID, originProjectId: asset.originProjectId || projectId });
    const globalAsset = await upsertGlobalAsset(normalized);
    const link = await linkAssetToProject(projectId, globalAsset.id, { addedFrom: asset.source === 'ai' || asset.provider ? 'ai_generation' : 'library', role: asset.role || 'candidate' });
    return attachProjectLink(projectId, globalAsset, link);
  });
}
async function getAsset(projectId, assetId) {
  const assets = await listAllAssets(projectId);
  return assets.find((asset) => asset.id === assetId || asset.assetId === assetId || asset.materialId === assetId) || null;
}
async function updateAsset(projectId, assetId, payload = {}) {
  return withAssetMutation(GLOBAL_ASSET_STORE_ID, async () => {
    const assets = await listGlobalAssetRecords();
    const index = assets.findIndex((asset) => asset.id === assetId || asset.assetId === assetId || asset.materialId === assetId);
    if (index === -1) return null;
    const existing = assets[index];
    if (projectId !== GLOBAL_ASSET_STORE_ID && !(await listAllAssets(projectId)).some((asset) => asset.id === existing.id)) return null;
    const allowed = {};
    if (payload.title !== undefined) allowed.title = String(payload.title || '').trim() || existing.title;
    if (payload.description !== undefined) allowed.description = String(payload.description || '');
    if (payload.type !== undefined) {
      const canonicalType = inferCanonicalType({ requestedType: payload.type, source: existing.source, mimeType: existing.mimeType });
      if (!canonicalTypes.has(canonicalType)) throw new Error('Unsupported asset type: ' + payload.type);
      allowed.type = canonicalType; allowed.assetType = normalizeLegacyAssetType(payload.type, existing.mimeType); allowed.mediaType = inferMediaType(existing.mimeType, payload.type);
    }
    if (payload.source !== undefined) allowed.source = normalizeSource(payload.source);
    if (payload.tags !== undefined) allowed.userTags = parseTags(payload.tags);
    if (payload.userTags !== undefined) allowed.userTags = parseTags(payload.userTags);
    if (payload.systemTags !== undefined) allowed.systemTags = parseTags(payload.systemTags);
    if (payload.metadata !== undefined) allowed.metadata = parseMetadata(payload.metadata);
    if (payload.thumbnailUrl !== undefined) allowed.thumbnailUrl = String(payload.thumbnailUrl || '') || existing.thumbnailUrl;
    if (payload.analysisStatus !== undefined) allowed.analysisStatus = String(payload.analysisStatus || existing.analysisStatus);
    if (payload.analysis !== undefined) allowed.analysis = payload.analysis;
    if (payload.analysisError !== undefined) allowed.analysisError = payload.analysisError;
    const updated = normalizeAsset(GLOBAL_ASSET_STORE_ID, { ...existing, ...allowed, projectId: GLOBAL_ASSET_STORE_ID, updatedAt: now() });
    assets[index] = updated;
    await writeGlobalAssetRecords(assets);
    return projectId === GLOBAL_ASSET_STORE_ID ? updated : attachProjectLink(projectId, updated, (await listProjectAssetLinks(projectId)).find((link) => link.assetId === updated.id));
  });
}
async function deleteGlobalAsset(assetId, options = {}) {
  return withAssetMutation(GLOBAL_ASSET_STORE_ID, async () => {
    const assets = await listGlobalAssetRecords();
    const target = assets.find((asset) => asset.id === assetId || asset.assetId === assetId || asset.materialId === assetId);
    if (!target) return null;
    const projectLinks = Array.isArray(options.projectIds) ? [...options.projectIds] : [];
    try {
      const { listProjects } = require('./storage.service');
      const projects = await listProjects();
      for (const project of projects) {
        const links = await listProjectAssetLinks(project.id || project.projectId);
        if (links.some((link) => link.assetId === target.id)) projectLinks.push(project.id || project.projectId);
      }
    } catch {
      // Best-effort cleanup; deleting the global asset should not fail because a legacy link file is unreadable.
    }
    const next = assets.filter((asset) => asset.id !== target.id && asset.assetId !== target.assetId && asset.materialId !== target.materialId);
    const removedSlices = await deleteSlicesByAsset(GLOBAL_ASSET_STORE_ID, target.id);
    for (const linkedProjectId of [...new Set(projectLinks.filter(Boolean))]) {
      const legacySlices = await deleteSlicesByAsset(linkedProjectId, target.id);
      removedSlices.push(...legacySlices);
      await deleteSampledFramesByAsset(linkedProjectId, target.id);
    }
    await removeAssetLocalFiles(target);
    for (const slice of removedSlices) {
      if (slice.thumbnailUrl && slice.thumbnailUrl !== target.fileUrl && slice.thumbnailUrl !== target.url && slice.thumbnailUrl !== target.thumbnailUrl && slice.thumbnailUrl !== target.previewUrl && slice.thumbnailUrl !== target.browserPreviewUrl) await removeLocalUploadIfPresent(slice.thumbnailUrl);
    }
    await deleteSampledFramesByAsset(GLOBAL_ASSET_STORE_ID, target.id);
    await writeGlobalAssetRecords(next);
    await removeAssetFromAllProjects(target.id);
    return target;
  });
}
async function deleteAsset(projectId, assetId, options = { deleteGlobal: true }) {
  if (options.deleteGlobal || projectId === GLOBAL_ASSET_STORE_ID) return deleteGlobalAsset(assetId, { projectIds: [projectId] });
  const asset = await getAsset(projectId, assetId);
  if (!asset) return null;
  await unlinkAssetFromProject(projectId, asset.id);
  return asset;
}
async function ensureVideoMetadata(asset) {
  if (asset.mediaType !== 'video') return asset;
  if (asset.metadata?.video?.duration) return asset;
  const diskPath = publicUploadPathToDisk(asset.fileUrl || asset.url);
  if (!diskPath) return asset;
  const videoMetadata = await probeVideoMetadata(diskPath);
  return normalizeAsset(asset.projectId, { ...asset, duration: videoMetadata.duration, metadata: { ...(asset.metadata || {}), video: videoMetadata } });
}

async function ensureVideoSlices(asset) {
  if (asset.mediaType !== 'video') return [];
  const existing = await listSlices(asset.projectId, asset.id);
  if (existing.total > 0) return existing.items;
  const diskPath = publicUploadPathToDisk(asset.fileUrl || asset.url);
  if (!diskPath || !asset.metadata?.video?.duration) return [];
  return createSlices(asset.projectId, asset.id, await createVideoSlicesFromAsset(asset, diskPath));
}

function localImagePathOrUrl(asset) {
  const diskPath = publicUploadPathToDisk(asset.fileUrl || asset.url);
  if (diskPath) return { imageFile: diskPath };
  const url = asset.fileUrl || asset.url;
  if (/^https?:\/\//.test(url || '')) return { imageUrl: url };
  return {};
}

function framesFromSliceThumbnails(projectId, assetId, slices = []) {
  return slices
    .filter((slice) => slice.thumbnailUrl)
    .map((slice) => {
      const filePath = publicUploadPathToDisk(slice.thumbnailUrl);
      return {
        timestamp: Number(((Number(slice.startTime || 0) + Number(slice.endTime || 0)) / 2).toFixed(3)),
        filePath: filePath || null,
        fileUrl: filePath ? slice.thumbnailUrl : (slice.thumbnailUrl || null),
        assetId,
        projectId,
        source: 'slice_thumbnail_fallback',
        sliceId: slice.id,
        createdAt: now(),
      };
    })
    .filter((frame) => frame.filePath || /^https?:\/\//.test(frame.fileUrl || ''));
}

async function buildSeed2AnalyzeOptions(asset, slices = [], requestOptions = {}) {
  if (asset.mediaType === 'video') {
    const diskPath = publicUploadPathToDisk(asset.fileUrl || asset.url);
    if (!diskPath) {
      const error = new Error('Seed 2.0 video analysis requires a local uploaded video file.');
      error.statusCode = 400;
      error.code = 'SEED2_VIDEO_FILE_MISSING';
      throw error;
    }
    let sampled = { frames: [], failures: [] };
    try {
      sampled = await sampleRepresentativeFrames({
        projectId: asset.projectId,
        assetId: asset.id,
        videoPath: diskPath,
        duration: asset.metadata?.video?.duration || asset.duration,
        slices,
      });
    } catch (error) {
      sampled = { frames: framesFromSliceThumbnails(asset.projectId, asset.id, slices), failures: [{ message: error.message }] };
    }
    if (!sampled.frames.length) {
      const error = new Error('Seed 2.0 video analysis requires representative frames; frame sampling and slice thumbnail fallback both failed.');
      error.statusCode = 400;
      error.code = 'SEED2_VIDEO_FRAMES_MISSING';
      throw error;
    }
    return {
      ...requestOptions,
      slices,
      frames: sampled.frames,
      promptContext: requestOptions.promptContext || {},
      frameSampling: {
        count: sampled.frames.length,
        timestamps: sampled.frames.map((frame) => frame.timestamp),
        failures: sampled.failures || [],
      },
    };
  }
  return { ...requestOptions, ...localImagePathOrUrl(asset), promptContext: requestOptions.promptContext || {} };
}

function buildAnalysisError(error, provider) {
  return {
    provider: provider || 'mock',
    code: error.code || 'ASSET_ANALYSIS_FAILED',
    message: error.message || 'Asset analysis failed.',
    details: error.details,
  };
}

function mergeSliceSuggestion(slice, suggestion = {}) {
  const suggestionTags = normalizeTags(suggestion.tags || []);
  return {
    ...slice,
    visualDescription: suggestion.visualDescription || slice.visualDescription,
    systemTags: mergeTags(slice.systemTags, suggestionTags),
    tags: mergeTags(slice.userTags, slice.systemTags, suggestionTags),
    metadata: {
      ...(slice.metadata || {}),
      analysis: {
        provider: 'seed2',
        usageSuggestion: suggestion.usageSuggestion || null,
        rawSuggestion: suggestion,
      },
    },
    analysisStatus: 'completed',
    updatedAt: now(),
  };
}

async function applySliceSuggestions(projectId, assetId, slices = [], suggestions = []) {
  if (!Array.isArray(suggestions) || suggestions.length === 0 || slices.length === 0) return slices;
  const updated = slices.map((slice, index) => {
    const suggestion = suggestions.find((item) => {
      const start = Number(item.startTime);
      const end = Number(item.endTime);
      return Number.isFinite(start) && Number.isFinite(end) && Math.abs(start - Number(slice.startTime)) < 0.75 && Math.abs(end - Number(slice.endTime)) < 1.25;
    }) || suggestions[index];
    return suggestion ? mergeSliceSuggestion(slice, suggestion) : slice;
  });
  return createSlices(projectId, assetId, updated);
}

async function analyzeAsset(projectId, assetId, options = {}) {
  let processing = null;
  await withAssetMutation(GLOBAL_ASSET_STORE_ID, async () => {
    const assets = await listGlobalAssetRecords();
    const index = assets.findIndex((asset) => asset.id === assetId || asset.assetId === assetId || asset.materialId === assetId);
    if (index === -1) return null;
    if (projectId !== GLOBAL_ASSET_STORE_ID && !(await listAllAssets(projectId)).some((asset) => asset.id === assets[index].id)) return null;
    processing = normalizeAsset(GLOBAL_ASSET_STORE_ID, { ...assets[index], projectId: GLOBAL_ASSET_STORE_ID, analysisStatus: 'processing', updatedAt: now() });
    assets[index] = processing; await writeGlobalAssetRecords(assets);
    return processing;
  });
  if (!processing) return null;
  try {
    processing = await ensureVideoMetadata(processing);
    const provider = options.provider || process.env.AI_ASSET_ANALYSIS_PROVIDER || 'mock';
    let slicesForAnalysis = [];
    let providerOptions = {};
    if (processing.mediaType === 'video') {
      slicesForAnalysis = await ensureVideoSlices(processing);
    }
    if (provider === 'seed2') {
      providerOptions = await buildSeed2AnalyzeOptions(processing, slicesForAnalysis, options);
    }
    const modelProvider = require('./model-provider.service');
    const analysis = await modelProvider.analyzeAsset(processing, { ...providerOptions, provider });
    const metadata = providerOptions.frameSampling
      ? { ...(processing.metadata || {}), video: processing.metadata?.video, frameSampling: providerOptions.frameSampling }
      : processing.metadata;
    const analyzed = normalizeAsset(GLOBAL_ASSET_STORE_ID, { ...processing, projectId: GLOBAL_ASSET_STORE_ID, metadata, analysisStatus: 'completed', analysis, analysisError: null, systemTags: mergeTags(processing.systemTags, analysis.tags), updatedAt: now() });
    return withAssetMutation(GLOBAL_ASSET_STORE_ID, async () => {
      const assets = await listGlobalAssetRecords();
      const index = assets.findIndex((asset) => asset.id === analyzed.id || asset.assetId === analyzed.id || asset.materialId === analyzed.id);
      if (index === -1) return null;
      assets[index] = analyzed;
      let createdSlices = [];
      if (analyzed.mediaType === 'video') {
        if (slicesForAnalysis.length) createdSlices = await applySliceSuggestions(GLOBAL_ASSET_STORE_ID, analyzed.id, slicesForAnalysis, analysis.sliceSuggestions);
        else {
          const diskPath = publicUploadPathToDisk(analyzed.fileUrl || analyzed.url);
          if (diskPath && analyzed.metadata?.video?.duration) createdSlices = await createSlices(GLOBAL_ASSET_STORE_ID, analyzed.id, await createVideoSlicesFromAsset(analyzed, diskPath));
          else createdSlices = await createSlices(GLOBAL_ASSET_STORE_ID, analyzed.id, []);
        }
      } else {
        await createSlices(GLOBAL_ASSET_STORE_ID, analyzed.id, []);
      }
      const thumbnailUrl = createdSlices[0]?.thumbnailUrl || analyzed.thumbnailUrl;
      const finalAsset = thumbnailUrl && thumbnailUrl !== analyzed.thumbnailUrl
        ? normalizeAsset(GLOBAL_ASSET_STORE_ID, { ...analyzed, thumbnailUrl, updatedAt: now() })
        : analyzed;
      assets[index] = finalAsset;
      await writeGlobalAssetRecords(assets);
      const link = projectId === GLOBAL_ASSET_STORE_ID ? null : (await listProjectAssetLinks(projectId)).find((item) => item.assetId === finalAsset.id);
      return { ...(projectId === GLOBAL_ASSET_STORE_ID ? finalAsset : attachProjectLink(projectId, finalAsset, link)), slices: createdSlices };
    });
  } catch (error) {
    await withAssetMutation(GLOBAL_ASSET_STORE_ID, async () => {
      const assets = await listGlobalAssetRecords();
      const index = assets.findIndex((asset) => asset.id === processing.id || asset.assetId === processing.id || asset.materialId === processing.id);
      if (index === -1) return null;
      const failed = normalizeAsset(GLOBAL_ASSET_STORE_ID, { ...processing, projectId: GLOBAL_ASSET_STORE_ID, analysisStatus: 'failed', analysisError: buildAnalysisError(error, options.provider || process.env.AI_ASSET_ANALYSIS_PROVIDER || 'mock'), updatedAt: now() });
      assets[index] = failed; await writeGlobalAssetRecords(assets); throw error;
    });
    throw error;
  }
}
async function getAssetSlices(projectId, assetId) {
  const asset = await getAsset(projectId, assetId); if (!asset) return null;
  const independent = await listSlices(projectId, asset.id); if (independent.total > 0) return independent;
  const legacyItems = Array.isArray(asset.slices) ? asset.slices : [];
  return { items: legacyItems, total: legacyItems.length, legacy: legacyItems.length > 0 };
}
async function getAssetSlice(projectId, assetId, sliceId) { const asset = await getAsset(projectId, assetId); if (!asset) return null; return getSlice(projectId, asset.id, sliceId); }
async function updateAssetSlice(projectId, assetId, sliceId, payload) { const asset = await getAsset(projectId, assetId); if (!asset) return null; return updateSlice(projectId, asset.id, sliceId, payload); }
async function deleteAssetSlice(projectId, assetId, sliceId) { const asset = await getAsset(projectId, assetId); if (!asset) return null; const removed = await deleteSlice(projectId, asset.id, sliceId); if (removed?.thumbnailUrl) await removeLocalUploadIfPresent(removed.thumbnailUrl); return removed; }
function normalizeRecallInput(input = {}) {
  return {
    ...input,
    keyword: input.keyword || (Array.isArray(input.keywords) ? input.keywords.join(' ') : input.keywords),
    requiredTags: input.requiredTags || input.tags || input.tag || [],
    optionalTags: input.optionalTags || [],
    limit: input.topK || input.limit,
  };
}
async function recallAssets(projectId, input = {}) {
  if (Array.isArray(input.embeddingQuery) && input.embeddingQuery.length > 0) { const error = new Error('Embedding recall is reserved for Phase 2 semantic search and is not implemented yet.'); error.statusCode = 501; throw error; }
  const assets = await listAllAssets(projectId);
  const assetIds = assets.map((asset) => asset.id);
  const slices = (await searchSlices(projectId, { assetIds })).items;
  return buildRecallResult(assets, slices, normalizeRecallInput(input));
}
async function searchProjectAssets(projectId, filters = {}) {
  if (Array.isArray(filters.embeddingQuery) && filters.embeddingQuery.length > 0) { const error = new Error('Embedding search is reserved for Phase 2 semantic search and is not implemented yet.'); error.statusCode = 501; throw error; }
  const assets = await listAllAssets(projectId);
  const assetIds = assets.map((asset) => asset.id);
  const slices = (await searchSlices(projectId, { assetIds })).items;
  return searchAssetMatches(assets, slices, { ...filters, requiredTags: filters.requiredTags || filters.tags || filters.tag || [], limit: filters.topK || filters.limit });
}
module.exports = { normalizeAsset, normalizeLegacyAssetType, listGlobalAssets, listAllAssets, listAssets, createAssetFromUpload, appendAsset, getAsset, getGlobalAsset, updateAsset, deleteAsset, deleteGlobalAsset, analyzeAsset, getAssetSlices, getAssetSlice, updateAssetSlice, deleteAssetSlice, recallAssets, searchProjectAssets, publicUploadPathToDisk };
