const { v4: uuidv4 } = require('uuid');
const { listAssetSlices, writeAssetSlices } = require('./storage.service');
const { normalizeTags, normalizeTagFields } = require('./asset-tag.service');

function now() { return new Date().toISOString(); }

function normalizeSlice(projectId, assetId, payload = {}, index = 0) {
  const timestamp = payload.createdAt || now();
  const tagFields = normalizeTagFields(payload);
  const startTime = Number(payload.startTime || 0);
  const endTime = Number(payload.endTime || 0);
  const duration = payload.duration !== undefined
    ? Number(payload.duration || 0)
    : Math.max(0, Number((endTime - startTime).toFixed(3)));
  return {
    ...payload,
    id: payload.id || ('slice_' + uuidv4()),
    projectId: payload.projectId || projectId,
    assetId: payload.assetId || assetId,
    index: Number(payload.index ?? index),
    startTime,
    endTime,
    duration,
    thumbnailUrl: payload.thumbnailUrl || null,
    transcript: payload.transcript || null,
    visualDescription: payload.visualDescription || '',
    userTags: tagFields.userTags,
    systemTags: tagFields.systemTags,
    tags: tagFields.tags,
    embedding: Array.isArray(payload.embedding) ? payload.embedding : null,
    metadata: payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata) ? payload.metadata : {},
    analysisStatus: payload.analysisStatus || 'completed',
    createdAt: timestamp,
    updatedAt: payload.updatedAt || timestamp,
  };
}

async function allSlices() { return listAssetSlices(); }

function applySliceFilters(items, filters = {}) {
  let next = items;
  if (filters.tag) {
    const tag = normalizeTags([filters.tag])[0];
    next = next.filter((s) => s.tags.includes(tag));
  }
  if (filters.tags?.length) {
    const required = normalizeTags(filters.tags);
    next = next.filter((s) => required.every((tag) => s.tags.includes(tag)));
  }
  if (filters.keyword) {
    const kw = String(filters.keyword).toLowerCase();
    next = next.filter((s) => JSON.stringify([s.visualDescription, s.transcript, s.tags, s.metadata]).toLowerCase().includes(kw));
  }
  return next;
}

async function listSlices(projectId, assetId, filters = {}) {
  const rows = (await allSlices()).map((s, i) => normalizeSlice(s.projectId, s.assetId, s, i));
  let items = rows.filter((s) => (s.projectId === projectId || s.projectId === 'global') && s.assetId === assetId);
  items = applySliceFilters(items, filters);
  return { items: items.sort((a, b) => a.index - b.index), total: items.length };
}

async function getSlice(projectId, assetId, sliceId) {
  const result = await listSlices(projectId, assetId);
  return result.items.find((s) => s.id === sliceId) || null;
}

async function createSlices(projectId, assetId, payloads = []) {
  const existing = await allSlices();
  const withoutAsset = existing.filter((s) => !(s.projectId === projectId && s.assetId === assetId));
  const created = payloads.map((payload, index) => normalizeSlice(projectId, assetId, payload, payload.index ?? index));
  await writeAssetSlices([...withoutAsset, ...created]);
  return created;
}

async function createSlice(projectId, assetId, payload) {
  const existing = await allSlices();
  const current = existing.filter((s) => s.projectId === projectId && s.assetId === assetId);
  const created = normalizeSlice(projectId, assetId, payload, current.length);
  await writeAssetSlices([...existing, created]);
  return created;
}

async function updateSlice(projectId, assetId, sliceId, payload = {}) {
  const existing = await allSlices();
  let updated = null;
  const next = existing.map((slice) => {
    if (slice.projectId === projectId && slice.assetId === assetId && slice.id === sliceId) {
      updated = normalizeSlice(projectId, assetId, { ...slice, ...payload, id: slice.id, projectId, assetId, updatedAt: now() }, slice.index);
      return updated;
    }
    return slice;
  });
  if (!updated) return null;
  await writeAssetSlices(next);
  return updated;
}

async function deleteSlice(projectId, assetId, sliceId) {
  const existing = await allSlices();
  const target = existing.find((s) => s.projectId === projectId && s.assetId === assetId && s.id === sliceId);
  if (!target) return null;
  await writeAssetSlices(existing.filter((s) => !(s.projectId === projectId && s.assetId === assetId && s.id === sliceId)));
  return normalizeSlice(projectId, assetId, target);
}

async function deleteSlicesByAsset(projectId, assetId) {
  const existing = await allSlices();
  const removed = existing.filter((s) => s.projectId === projectId && s.assetId === assetId).map((s) => normalizeSlice(projectId, assetId, s));
  await writeAssetSlices(existing.filter((s) => !(s.projectId === projectId && s.assetId === assetId)));
  return removed;
}

async function searchSlices(projectId, query = {}) {
  const rows = (await allSlices()).map((s, i) => normalizeSlice(s.projectId, s.assetId, s, i));
  let items = rows.filter((s) => s.projectId === projectId || s.projectId === 'global');
  if (query.assetId) items = items.filter((s) => s.assetId === query.assetId);
  if (Array.isArray(query.assetIds) && query.assetIds.length) {
    const ids = new Set(query.assetIds);
    items = items.filter((s) => ids.has(s.assetId));
  }
  items = applySliceFilters(items, query);
  return { items, total: items.length };
}

module.exports = { normalizeSlice, listSlices, getSlice, createSlice, createSlices, updateSlice, deleteSlice, deleteSlicesByAsset, searchSlices };
