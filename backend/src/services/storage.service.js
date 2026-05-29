const fs = require('fs/promises');
const path = require('path');
const {
  PROJECTS_DIR,
  ASSETS_DIR,
  SCRIPTS_DIR,
  STORYBOARDS_DIR,
  TASKS_DIR,
  ASSET_GENERATION_TASKS_FILE,
  COMPLIANCE_REVIEWS_FILE,
  DISTRIBUTION_EVENTS_FILE,
  CONVERSION_EVENTS_FILE,
  ASSET_SLICES_FILE,
  TEMPLATES_FILE,
  REFERENCE_VIDEOS_FILE,
  EDITING_PLANS_FILE,
} = require('../config/paths');
const { ensureSafeId } = require('./id-validator.service');

async function parseJsonFile(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    if (error instanceof SyntaxError) {
      console.warn('[storage] Invalid JSON, returning fallback', { filePath, message: error.message });
      return fallback;
    }
    throw error;
  }
}

async function writeJsonFile(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${Date.now()}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(payload, null, 2));
  await fs.rename(tempPath, filePath);
}

async function readProject(id) {
  return parseJsonFile(path.join(PROJECTS_DIR, `${ensureSafeId(id)}.json`), null);
}

async function writeProject(id, payload) {
  await writeJsonFile(path.join(PROJECTS_DIR, `${ensureSafeId(id)}.json`), payload);
}

async function listProjects() {
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  const files = await fs.readdir(PROJECTS_DIR);
  const records = await Promise.all(
    files.filter((name) => name.endsWith('.json')).map((name) => parseJsonFile(path.join(PROJECTS_DIR, name), null))
  );
  return records.filter(Boolean);
}

async function readAssets(id, fallback = []) {
  return parseJsonFile(path.join(ASSETS_DIR, `${ensureSafeId(id)}.json`), fallback);
}

async function writeAssets(id, payload) {
  await writeJsonFile(path.join(ASSETS_DIR, `${ensureSafeId(id)}.json`), payload);
}

async function readScript(id) {
  return parseJsonFile(path.join(SCRIPTS_DIR, `${ensureSafeId(id)}.json`), null);
}

async function writeScript(id, payload) {
  await writeJsonFile(path.join(SCRIPTS_DIR, `${ensureSafeId(id)}.json`), payload);
}

async function readStoryboard(id) {
  return parseJsonFile(path.join(STORYBOARDS_DIR, `${ensureSafeId(id)}.json`), null);
}

async function writeStoryboard(id, payload) {
  await writeJsonFile(path.join(STORYBOARDS_DIR, `${ensureSafeId(id)}.json`), payload);
}

async function readTask(id) {
  return parseJsonFile(path.join(TASKS_DIR, `${ensureSafeId(id)}.json`), null);
}

async function writeTask(id, payload) {
  await writeJsonFile(path.join(TASKS_DIR, `${ensureSafeId(id)}.json`), payload);
}

async function listTasks() {
  await fs.mkdir(TASKS_DIR, { recursive: true });
  const files = await fs.readdir(TASKS_DIR);
  const records = await Promise.all(
    files.filter((name) => name.endsWith('.json')).map((name) => parseJsonFile(path.join(TASKS_DIR, name), null))
  );
  return records.filter(Boolean);
}

async function readJsonFile(filePath, fallback = []) {
  return parseJsonFile(filePath, fallback);
}


async function listAssetSlices() {
  return readJsonFile(ASSET_SLICES_FILE, []);
}

async function writeAssetSlices(slices) {
  await writeJsonFile(ASSET_SLICES_FILE, slices);
}

async function listTemplates() {
  return readJsonFile(TEMPLATES_FILE, []);
}

async function writeTemplates(templates) {
  await writeJsonFile(TEMPLATES_FILE, templates);
}

async function listReferenceVideos() {
  return readJsonFile(REFERENCE_VIDEOS_FILE, []);
}

async function writeReferenceVideos(videos) {
  await writeJsonFile(REFERENCE_VIDEOS_FILE, videos);
}

async function listEditingPlans() {
  return readJsonFile(EDITING_PLANS_FILE, []);
}

async function writeEditingPlans(plans) {
  await writeJsonFile(EDITING_PLANS_FILE, plans);
}

async function listAssetGenerationTasks() {
  return readJsonFile(ASSET_GENERATION_TASKS_FILE, []);
}

async function writeAssetGenerationTasks(tasks) {
  await writeJsonFile(ASSET_GENERATION_TASKS_FILE, tasks);
}

async function listComplianceReviews() {
  return readJsonFile(COMPLIANCE_REVIEWS_FILE, []);
}

async function writeComplianceReviews(reviews) {
  await writeJsonFile(COMPLIANCE_REVIEWS_FILE, reviews);
}

async function writeDistributionEvents(events) {
  await writeJsonFile(DISTRIBUTION_EVENTS_FILE, events);
}

async function writeConversionEvents(events) {
  await writeJsonFile(CONVERSION_EVENTS_FILE, events);
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
  readJsonFile,
  writeJsonFile,
  listAssetSlices,
  writeAssetSlices,
  listTemplates,
  writeTemplates,
  listReferenceVideos,
  writeReferenceVideos,
  listEditingPlans,
  writeEditingPlans,
  listAssetGenerationTasks,
  writeAssetGenerationTasks,
  listComplianceReviews,
  writeComplianceReviews,
  writeDistributionEvents,
  writeConversionEvents,
};
