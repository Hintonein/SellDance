const { v4: uuidv4 } = require('uuid');
const { listAssetSlices, writeAssetSlices } = require('./storage.service');

function now() { return new Date().toISOString(); }
function tags(value) {
  if (Array.isArray(value)) return [...new Set(value.map((x) => String(x || '').trim()).filter(Boolean))];
  if (!value) return [];
  return [...new Set(String(value).split(',').map((x) => x.trim()).filter(Boolean))];
}
function normalizeSlice(projectId, assetId, payload = {}, index = 0) {
  const timestamp = payload.createdAt || now();
  return {
    id: payload.id || `slice_${uuidv4()}`,
    projectId: payload.projectId || projectId,
    assetId: payload.assetId || assetId,
    index: Number(payload.index ?? index),
    startTime: Number(payload.startTime || 0),
    endTime: Number(payload.endTime || 0),
    thumbnailUrl: payload.thumbnailUrl || null,
    transcript: payload.transcript || null,
    visualDescription: payload.visualDescription || '',
    tags: tags(payload.tags),
    embedding: Array.isArray(payload.embedding) ? payload.embedding : null,
    metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
    analysisStatus: payload.analysisStatus || 'completed',
    createdAt: timestamp,
    updatedAt: payload.updatedAt || timestamp,
  };
}
async function allSlices() { return listAssetSlices(); }
async function listSlices(projectId, assetId, filters = {}) {
  const rows = (await allSlices()).map((s, i) => normalizeSlice(s.projectId, s.assetId, s, i));
  let items = rows.filter((s) => s.projectId === projectId && s.assetId === assetId);
  if (filters.tag) items = items.filter((s) => s.tags.includes(filters.tag));
  if (filters.keyword) {
    const kw = String(filters.keyword).toLowerCase();
    items = items.filter((s) => JSON.stringify([s.visualDescription, s.transcript, s.tags, s.metadata]).toLowerCase().includes(kw));
  }
  return { items: items.sort((a, b) => a.index - b.index), total: items.length };
}
async function getSlice(projectId, assetId, sliceId) {
  const result = await listSlices(projectId, assetId);
  return result.items.find((s) => s.id === sliceId) || null;
}
async function createSlices(projectId, assetId, payloads = []) {
  const existing = await allSlices();
  const withoutAsset = existing.filter((s) => !(s.projectId === projectId && s.assetId === assetId));
  const created = payloads.map((payload, index) => normalizeSlice(projectId, assetId, payload, index));
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
  const removed = existing.filter((s) => s.projectId === projectId && s.assetId === assetId);
  await writeAssetSlices(existing.filter((s) => !(s.projectId === projectId && s.assetId === assetId)));
  return removed.length;
}
async function searchSlices(projectId, query = {}) {
  const rows = (await allSlices()).map((s, i) => normalizeSlice(s.projectId, s.assetId, s, i));
  let items = rows.filter((s) => s.projectId === projectId);
  if (query.assetId) items = items.filter((s) => s.assetId === query.assetId);
  if (query.tags?.length) items = items.filter((s) => query.tags.every((tag) => s.tags.includes(tag)));
  if (query.keyword) {
    const kw = String(query.keyword).toLowerCase();
    items = items.filter((s) => JSON.stringify([s.visualDescription, s.transcript, s.tags]).toLowerCase().includes(kw));
  }
  return { items, total: items.length };
}
module.exports = { normalizeSlice, listSlices, getSlice, createSlice, createSlices, updateSlice, deleteSlice, deleteSlicesByAsset, searchSlices };
