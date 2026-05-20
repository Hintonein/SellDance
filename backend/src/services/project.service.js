const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { PROJECTS_DIR } = require('../config/paths');
const { readJsonFiles, readJson, writeJson } = require('./storage.service');

function projectFilePath(projectId) {
  return path.join(PROJECTS_DIR, `${projectId}.json`);
}

async function listProjects() {
  const projects = await readJsonFiles(PROJECTS_DIR);
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
  await writeJson(projectFilePath(project.id), project);
  return project;
}

async function getProject(projectId) {
  return readJson(projectFilePath(projectId));
}

module.exports = {
  listProjects,
  createProject,
  getProject,
};
