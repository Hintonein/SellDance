const { v4: uuidv4 } = require('uuid');
const { listProjects: listProjectRecords, readProject, writeProject } = require('./storage.service');

async function listProjects() {
  const projects = await listProjectRecords();
  return projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function createProject(payload) {
  const now = new Date().toISOString();
  const project = {
    id: uuidv4(),
    name: payload.name,
    productName: payload.productName || payload.name,
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

module.exports = {
  listProjects,
  createProject,
  getProject,
};
