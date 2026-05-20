const fs = require('fs/promises');
const path = require('path');
const {
  PROJECTS_DIR,
  ASSETS_DIR,
  SCRIPTS_DIR,
  STORYBOARDS_DIR,
  TASKS_DIR,
} = require('../config/paths');
const { ensureSafeId } = require('./id-validator.service');

async function readProject(id) {
  try {
    const raw = await fs.readFile(path.join(PROJECTS_DIR, `${ensureSafeId(id)}.json`), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeProject(id, payload) {
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  await fs.writeFile(path.join(PROJECTS_DIR, `${ensureSafeId(id)}.json`), JSON.stringify(payload, null, 2));
}

async function listProjects() {
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  const files = await fs.readdir(PROJECTS_DIR);
  const jsonFiles = files.filter((name) => name.endsWith('.json'));
  const records = await Promise.all(
    jsonFiles.map(async (name) => JSON.parse(await fs.readFile(path.join(PROJECTS_DIR, name), 'utf8')))
  );
  return records.filter(Boolean);
}

async function readAssets(id, fallback = []) {
  try {
    const raw = await fs.readFile(path.join(ASSETS_DIR, `${ensureSafeId(id)}.json`), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeAssets(id, payload) {
  await fs.mkdir(ASSETS_DIR, { recursive: true });
  await fs.writeFile(path.join(ASSETS_DIR, `${ensureSafeId(id)}.json`), JSON.stringify(payload, null, 2));
}

async function readScript(id) {
  try {
    const raw = await fs.readFile(path.join(SCRIPTS_DIR, `${ensureSafeId(id)}.json`), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeScript(id, payload) {
  await fs.mkdir(SCRIPTS_DIR, { recursive: true });
  await fs.writeFile(path.join(SCRIPTS_DIR, `${ensureSafeId(id)}.json`), JSON.stringify(payload, null, 2));
}

async function readStoryboard(id) {
  try {
    const raw = await fs.readFile(path.join(STORYBOARDS_DIR, `${ensureSafeId(id)}.json`), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeStoryboard(id, payload) {
  await fs.mkdir(STORYBOARDS_DIR, { recursive: true });
  await fs.writeFile(path.join(STORYBOARDS_DIR, `${ensureSafeId(id)}.json`), JSON.stringify(payload, null, 2));
}

async function readTask(id) {
  try {
    const raw = await fs.readFile(path.join(TASKS_DIR, `${ensureSafeId(id)}.json`), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeTask(id, payload) {
  await fs.mkdir(TASKS_DIR, { recursive: true });
  await fs.writeFile(path.join(TASKS_DIR, `${ensureSafeId(id)}.json`), JSON.stringify(payload, null, 2));
}

async function listTasks() {
  await fs.mkdir(TASKS_DIR, { recursive: true });
  const files = await fs.readdir(TASKS_DIR);
  const jsonFiles = files.filter((name) => name.endsWith('.json'));
  const records = await Promise.all(
    jsonFiles.map(async (name) => JSON.parse(await fs.readFile(path.join(TASKS_DIR, name), 'utf8')))
  );
  return records.filter(Boolean);
}

module.exports = {
  readProject,
  writeProject,
  listProjects,
  readAssets,
  writeAssets,
  readScript,
  writeScript,
  readStoryboard,
  writeStoryboard,
  readTask,
  writeTask,
  listTasks,
};
