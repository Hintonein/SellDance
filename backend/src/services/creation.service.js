const planning = require('./creation-planning.service');
const videoTask = require('./video-task.service');
const { OUTPUTS_DIR } = require('../config/paths');
const fs = require('fs/promises');
const path = require('path');

async function createEditingPlan(projectId, payload) { return planning.createEditingPlan(projectId, payload); }
async function createRenderTask(projectId, payload = {}) { return videoTask.createTask(projectId, payload); }
async function listCreationTasks(projectId) { return videoTask.listTasks(projectId); }
async function getCreationTask(projectId, taskId) {
  const task = await videoTask.getTask(taskId);
  return task && task.projectId === projectId ? task : null;
}
async function retryCreationTask(projectId, taskId) {
  const task = await videoTask.retryTask(taskId);
  return task && task.projectId === projectId ? task : null;
}
async function cancelCreationTask(projectId, taskId) {
  const task = await videoTask.cancelTask(taskId);
  return task && task.projectId === projectId ? task : null;
}
async function listOutputs(projectId) {
  const dir = path.join(OUTPUTS_DIR, projectId);
  try {
    const files = (await fs.readdir(dir)).filter((file) => file.endsWith('.mp4'));
    return { items: files.map((file) => ({ file, url: `/outputs/${projectId}/${file}` })), total: files.length };
  } catch (error) {
    if (error.code === 'ENOENT') return { items: [], total: 0 };
    throw error;
  }
}
module.exports = { createEditingPlan, createRenderTask, listCreationTasks, getCreationTask, retryCreationTask, cancelCreationTask, listOutputs };
