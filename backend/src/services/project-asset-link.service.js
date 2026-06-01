const { readProjectAssetLinks, writeProjectAssetLinks, listProjects } = require('./storage.service');

function now() { return new Date().toISOString(); }

function normalizeId(value) {
  return String(value || '').trim();
}

function normalizeLink(projectId, payload = {}) {
  const assetId = normalizeId(payload.assetId || payload.id);
  const timestamp = payload.addedAt || now();
  return {
    projectId,
    assetId,
    selectedSliceIds: Array.isArray(payload.selectedSliceIds)
      ? payload.selectedSliceIds.map(normalizeId).filter(Boolean)
      : [],
    role: payload.role || 'candidate',
    addedFrom: payload.addedFrom || 'library',
    addedAt: timestamp,
    updatedAt: payload.updatedAt || timestamp,
  };
}

async function listProjectAssetLinks(projectId) {
  const links = await readProjectAssetLinks(projectId, []);
  return Array.isArray(links)
    ? links.map((link) => normalizeLink(projectId, link)).filter((link) => link.assetId)
    : [];
}

async function writeNormalizedLinks(projectId, links) {
  await writeProjectAssetLinks(projectId, links.map((link) => normalizeLink(projectId, link)));
}

async function linkAssetToProject(projectId, assetId, payload = {}) {
  const normalizedAssetId = normalizeId(assetId || payload.assetId);
  if (!normalizedAssetId) {
    const error = new Error('assetId is required to link an asset to a project.');
    error.statusCode = 400;
    throw error;
  }
  const links = await listProjectAssetLinks(projectId);
  const existing = links.find((link) => link.assetId === normalizedAssetId);
  const nextLink = normalizeLink(projectId, {
    ...existing,
    ...payload,
    assetId: normalizedAssetId,
    updatedAt: now(),
  });
  const next = existing
    ? links.map((link) => (link.assetId === normalizedAssetId ? nextLink : link))
    : [nextLink, ...links];
  await writeNormalizedLinks(projectId, next);
  return nextLink;
}

async function unlinkAssetFromProject(projectId, assetId) {
  const normalizedAssetId = normalizeId(assetId);
  const links = await listProjectAssetLinks(projectId);
  const target = links.find((link) => link.assetId === normalizedAssetId);
  if (!target) return null;
  await writeNormalizedLinks(projectId, links.filter((link) => link.assetId !== normalizedAssetId));
  return target;
}

async function isAssetLinkedToProject(projectId, assetId) {
  const normalizedAssetId = normalizeId(assetId);
  const links = await listProjectAssetLinks(projectId);
  return links.some((link) => link.assetId === normalizedAssetId);
}

async function removeAssetFromAllProjects(assetId) {
  const projects = await listProjects();
  const removed = [];
  for (const project of projects) {
    const link = await unlinkAssetFromProject(project.id || project.projectId, assetId);
    if (link) removed.push(link);
  }
  return removed;
}

module.exports = {
  normalizeLink,
  listProjectAssetLinks,
  linkAssetToProject,
  unlinkAssetFromProject,
  isAssetLinkedToProject,
  removeAssetFromAllProjects,
};
