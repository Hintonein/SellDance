const { v4: uuidv4 } = require('uuid');
const { listAssetAnalysisTasks, writeAssetAnalysisTasks } = require('./storage.service');
const { analyzeAsset, getAsset } = require('./asset.service');

const DEFAULT_CONCURRENCY = 5;
const terminalStatuses = new Set(['completed', 'failed', 'cancelled']);
const runningTaskIds = new Set();
let schedulerActive = false;

function now() {
  return new Date().toISOString();
}

function maxConcurrency() {
  const configured = Number(process.env.ASSET_ANALYSIS_CONCURRENCY || DEFAULT_CONCURRENCY);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_CONCURRENCY;
  return Math.max(1, Math.min(5, Math.floor(configured)));
}

async function saveTask(task) {
  const tasks = await listAssetAnalysisTasks();
  const exists = tasks.some((item) => item.id === task.id);
  const next = exists ? tasks.map((item) => (item.id === task.id ? task : item)) : [task, ...tasks];
  await writeAssetAnalysisTasks(next);
  return task;
}

async function updateTask(task, patch) {
  const next = { ...task, ...patch, updatedAt: now() };
  await saveTask(next);
  return next;
}

async function listTasks(projectId) {
  const tasks = await listAssetAnalysisTasks();
  return tasks
    .filter((task) => task.projectId === projectId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function getTask(projectId, taskId) {
  const tasks = await listTasks(projectId);
  return tasks.find((task) => task.id === taskId) || null;
}

async function findActiveTask(projectId, assetId) {
  const tasks = await listTasks(projectId);
  return tasks.find((task) => task.assetId === assetId && !terminalStatuses.has(task.status)) || null;
}

function publicTask(task) {
  return {
    id: task.id,
    projectId: task.projectId,
    assetId: task.assetId,
    assetTitle: task.assetTitle,
    status: task.status,
    stage: task.stage,
    progress: task.progress,
    provider: task.provider,
    resultAssetId: task.resultAssetId,
    error: task.error,
    logs: task.logs || [],
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    updatedAt: task.updatedAt,
  };
}

function log(task, message, level = 'info') {
  task.logs = [...(task.logs || []), { level, message, at: now() }].slice(-80);
}

async function runTask(task) {
  let current = task;
  runningTaskIds.add(task.id);
  try {
    log(current, `Asset analysis started for ${task.assetTitle || task.assetId}.`);
    current = await updateTask(current, {
      status: 'running',
      stage: 'analyzing',
      progress: 15,
      startedAt: now(),
    });
    const analyzed = await analyzeAsset(task.projectId, task.assetId, task.options || {});
    if (!analyzed) {
      const error = new Error(`Asset ${task.assetId} was not found in project ${task.projectId}.`);
      error.statusCode = 404;
      throw error;
    }
    log(current, 'Asset analysis completed.');
    current = await updateTask(current, {
      status: 'completed',
      stage: 'completed',
      progress: 100,
      resultAssetId: analyzed.id || analyzed.assetId || task.assetId,
      completedAt: now(),
      error: null,
    });
  } catch (error) {
    log(current, error.message || 'Asset analysis failed.', 'error');
    await updateTask(current, {
      status: 'failed',
      stage: 'failed',
      progress: current.progress || 0,
      completedAt: now(),
      error: {
        message: error.message || 'Asset analysis failed.',
        code: error.code,
      },
    });
  } finally {
    runningTaskIds.delete(task.id);
    schedule();
  }
}

async function schedule() {
  if (schedulerActive) return;
  schedulerActive = true;
  try {
    while (runningTaskIds.size < maxConcurrency()) {
      const tasks = await listAssetAnalysisTasks();
      const next = tasks
        .filter((task) => task.status === 'queued' && !runningTaskIds.has(task.id))
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
      if (!next) break;
      runTask(next);
    }
  } finally {
    schedulerActive = false;
  }
}

async function createAssetAnalysisTask(projectId, assetId, options = {}) {
  const existing = await findActiveTask(projectId, assetId);
  if (existing) return publicTask(existing);
  const asset = await getAsset(projectId, assetId);
  if (!asset) return null;
  const task = {
    id: `asset_analysis_${uuidv4()}`,
    projectId,
    assetId: asset.id || assetId,
    assetTitle: asset.title || asset.name || asset.originalName || asset.id || assetId,
    status: 'queued',
    stage: 'queued',
    progress: 0,
    provider: options.provider || process.env.AI_ASSET_ANALYSIS_PROVIDER || 'mock',
    options,
    resultAssetId: null,
    error: null,
    logs: [],
    createdAt: now(),
    updatedAt: now(),
  };
  log(task, 'Asset analysis queued.');
  await saveTask(task);
  schedule();
  return publicTask(task);
}

module.exports = {
  createAssetAnalysisTask,
  getTask: async (projectId, taskId) => {
    const task = await getTask(projectId, taskId);
    return task ? publicTask(task) : null;
  },
  listTasks: async (projectId) => (await listTasks(projectId)).map(publicTask),
  schedule,
};
