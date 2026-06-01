const { v4: uuidv4 } = require('uuid');
const { listProjects: listProjectRecords, readProject, writeProject } = require('./storage.service');

async function listProjects() {
  const projects = await listProjectRecords();
  return projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function createProject(payload) {
  const now = new Date().toISOString();
  const id = uuidv4();
  const sellingPoints = Array.isArray(payload.sellingPoints)
    ? payload.sellingPoints
    : String(payload.sellingPoints || payload.description || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
  const project = {
    id,
    projectId: id,
    name: payload.name || payload.projectName || payload.productName,
    projectName: payload.projectName || payload.name || payload.productName,
    productName: payload.productName || payload.name || payload.projectName,
    productUrl: payload.productUrl || payload.productId || '',
    productId: payload.productId || '',
    productCategory: payload.productCategory || payload.category || 'general commerce',
    targetAudience: payload.targetAudience || payload.audience || 'social commerce shoppers',
    sellingPoints,
    tone: payload.tone || 'confident',
    style: payload.style || payload.marketingStyle || 'short-form product demo',
    targetPlatform: payload.targetPlatform || 'TikTok Shop',
    expectedDuration: Number(payload.expectedDuration || 15),
    status: 'active',
    description: payload.description || '',
    createdAt: now,
    updatedAt: now,
  };
  await writeProject(project.id, project);
  return project;
}

async function getProject(projectId) {
  return readProject(projectId);
}

async function updateProject(projectId, payload) {
  const existing = await readProject(projectId);
  if (!existing) return null;
  const next = {
    ...existing,
    ...payload,
    name: payload.name || payload.projectName || existing.name,
    projectName: payload.projectName || payload.name || existing.projectName || existing.name,
    updatedAt: new Date().toISOString(),
  };
  await writeProject(projectId, next);
  return next;
}

async function archiveProject(projectId) {
  return updateProject(projectId, { status: 'archived' });
}

module.exports = {
  listProjects,
  createProject,
  getProject,
  updateProject,
  archiveProject,
};
