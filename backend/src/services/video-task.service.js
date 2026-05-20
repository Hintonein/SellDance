const { v4: uuidv4 } = require('uuid');
const { readTask, listTasks: listTaskRecords, writeTask } = require('./storage.service');

const runningJobs = new Map();

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
  await writeTask(task.id, task);
  return task;
}

async function runTask(task, failAt = null) {
  const checkpoints = [15, 35, 60, 80, 100];
  task.status = 'in_progress';
  task.errorMessage = null;
  task.progress = 5;
  await persistTask(task);

  let index = 0;
  const timer = setInterval(async () => {
    const nextProgress = checkpoints[index];
    task.progress = nextProgress;

    if (failAt && nextProgress >= failAt) {
      clearInterval(timer);
      runningJobs.delete(task.id);
      task.status = 'failed';
      task.errorMessage = 'Mock renderer failed while compositing scenes. Please retry.';
      task.updatedAt = new Date().toISOString();
      await persistTask(task);
      return;
    }

    if (nextProgress >= 100) {
      clearInterval(timer);
      runningJobs.delete(task.id);
      task.status = 'completed';
      task.exportFile = `exports/${task.projectId}-${task.id}.mp4`;
    }

    task.updatedAt = new Date().toISOString();
    await persistTask(task);
    index += 1;
  }, 700);

  runningJobs.set(task.id, timer);
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
    createdAt: now,
    updatedAt: now,
  };
  await persistTask(task);
  await runTask(task, options.forceFail ? 60 : null);
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
    retries: (task.retries || 0) + 1,
    updatedAt: new Date().toISOString(),
  };

  await persistTask(nextTask);
  await runTask(nextTask, null);
  return nextTask;
}

module.exports = {
  getTask,
  listTasks,
  createTask,
  retryTask,
};
