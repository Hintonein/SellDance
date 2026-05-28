const { v4: uuidv4 } = require('uuid');
const { readTask, listTasks: listTaskRecords, writeTask, readStoryboard } = require('./storage.service');
const { normalizeScenes } = require('./storyboard-scene.service');
const { listMaterials } = require('./material.service');
const { renderProjectVideo } = require('./video-render.service');

const runningJobs = new Set();
const stepByStatus = {
  queued: 'analyzing assets',
  processing: 'generating script',
  rendering: 'rendering video',
  running: 'rendering video',
  completed: 'exporting',
  failed: 'failed',
};

async function getTask(taskId) {
  const task = await readTask(taskId);
  return task ? decorateTask(task) : null;
}

async function listTasks(projectId) {
  const tasks = await listTaskRecords();
  return tasks
    .filter((task) => task.projectId === projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(decorateTask);
}

async function persistTask(task) {
  task.updatedAt = new Date().toISOString();
  await writeTask(task.id, task);
  return task;
}

async function updateTaskState(task, { status, progress, errorMessage, exportFile, videoUrl }) {
  if (status) task.status = status;
  if (status) task.currentStep = stepByStatus[status] || task.currentStep;
  if (typeof progress === 'number') task.progress = Math.max(0, Math.min(100, Math.round(progress)));
  if (errorMessage !== undefined) task.errorMessage = errorMessage;
  if (exportFile !== undefined) task.exportFile = exportFile;
  if (videoUrl !== undefined) task.videoUrl = videoUrl;
  return persistTask(task);
}

async function runTask(task) {
  if (runningJobs.has(task.id)) return;
  runningJobs.add(task.id);

  try {
    await updateTaskState(task, { status: 'processing', progress: 5, errorMessage: null });

    const storyboard = await readStoryboard(task.projectId);
    const scenes = normalizeScenes(storyboard?.scenes || []);
    if (scenes.length === 0) {
      throw new Error('Storyboard is empty. Please generate or save storyboard scenes first.');
    }

    const materials = await listMaterials(task.projectId);
    await updateTaskState(task, { status: 'rendering', progress: 10 });

    const rendered = await renderProjectVideo({
      projectId: task.projectId,
      taskId: task.id,
      scenes,
      materials,
      options: task.options || {},
      onProgress: async (progress) => {
        await updateTaskState(task, { status: 'rendering', progress });
      },
    });

    await updateTaskState(task, {
      status: 'completed',
      progress: 100,
      errorMessage: null,
      exportFile: rendered.exportFile,
      videoUrl: rendered.videoUrl,
    });
  } catch (error) {
    await updateTaskState(task, {
      status: 'failed',
      progress: Math.max(task.progress || 0, 10),
      errorMessage: error.message || 'Video rendering failed.',
    });
  } finally {
    runningJobs.delete(task.id);
  }
}

async function createTask(projectId, options = {}) {
  const now = new Date().toISOString();
  const task = {
    id: uuidv4(),
    projectId,
    status: 'queued',
    progress: 0,
    currentStep: 'analyzing assets',
    errorMessage: null,
    options,
    scriptId: options.scriptId || projectId,
    storyboardId: options.storyboardId || projectId,
    retries: 0,
    exportFile: null,
    videoUrl: null,
    outputVideoUrl: null,
    exportPresets: [],
    createdAt: now,
    updatedAt: now,
  };

  await persistTask(task);
  runTask(task);
  return task;
}

async function retryTask(taskId) {
  const task = await getTask(taskId);
  if (!task) return null;
  if (runningJobs.has(taskId)) return task;

  const nextTask = {
    ...task,
    status: 'queued',
    progress: 0,
    errorMessage: null,
    exportFile: null,
    videoUrl: null,
    retries: (task.retries || 0) + 1,
    updatedAt: new Date().toISOString(),
  };

  await persistTask(nextTask);
  runTask(nextTask);
  return nextTask;
}

function decorateTask(task) {
  const outputVideoUrl = task.outputVideoUrl || task.videoUrl || null;
  const exportPresets = outputVideoUrl
    ? [
        { presetId: 'vertical', aspectRatio: '9:16', label: 'TikTok/Reels 9:16', url: outputVideoUrl },
        { presetId: 'wide', aspectRatio: '16:9', label: 'YouTube 16:9', url: outputVideoUrl },
      ]
    : task.exportPresets || [];
  return {
    ...task,
    taskId: task.taskId || task.id,
    status: task.status === 'processing' || task.status === 'rendering' ? 'running' : task.status,
    rawStatus: task.status,
    currentStep: task.currentStep || stepByStatus[task.status] || 'queued',
    outputVideoUrl,
    exportPresets,
  };
}

module.exports = {
  getTask,
  listTasks,
  createTask,
  retryTask,
};
