const { v4: uuidv4 } = require('uuid');
const { readTask, listTasks: listTaskRecords, writeTask, readStoryboard } = require('./storage.service');
const { normalizeScenes } = require('./storyboard-scene.service');
const { listMaterials } = require('./material.service');
const { renderProjectVideo } = require('./video-render.service');

const runningJobs = new Set();

async function getTask(taskId) {
  return readTask(taskId);
}

async function listTasks(projectId) {
  const tasks = await listTaskRecords();
  return tasks
    .filter((task) => task.projectId === projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function persistTask(task) {
  task.updatedAt = new Date().toISOString();
  await writeTask(task.id, task);
  return task;
}

async function updateTaskState(task, { status, progress, errorMessage, exportFile, videoUrl }) {
  if (status) task.status = status;
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
    errorMessage: null,
    options,
    retries: 0,
    exportFile: null,
    videoUrl: null,
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

module.exports = {
  getTask,
  listTasks,
  createTask,
  retryTask,
};
