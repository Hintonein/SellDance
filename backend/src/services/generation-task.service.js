const videoTask = require('./video-task.service');
async function createTask(payload = {}) { return videoTask.createTask(payload.projectId, payload.options || payload); }
async function getTask(taskId) { return videoTask.getTask(taskId); }
async function listTasks(filters = {}) { return videoTask.listTasks(filters.projectId, filters); }
async function updateTask(_taskId, _patch) { const error = new Error('Generic task update is a Phase 1.5 placeholder.'); error.statusCode = 501; throw error; }
async function completeTask(_taskId, _result) { const error = new Error('Generic task completion is a Phase 1.5 placeholder.'); error.statusCode = 501; throw error; }
async function failTask(_taskId, _error) { const error = new Error('Generic task failure is a Phase 1.5 placeholder.'); error.statusCode = 501; throw error; }
async function retryTask(taskId) { return videoTask.retryTask(taskId); }
async function cancelTask(taskId) { return videoTask.cancelTask(taskId); }
async function deleteTask(projectId, taskId, payload = {}) { return videoTask.moveTaskToTrash(projectId, taskId, payload); }
async function restoreTask(projectId, taskId) { return videoTask.restoreTask(projectId, taskId); }
async function permanentlyDeleteTask(projectId, taskId) { return videoTask.permanentlyDeleteTask(projectId, taskId); }
module.exports = { createTask, getTask, listTasks, updateTask, completeTask, failTask, retryTask, cancelTask, deleteTask, restoreTask, permanentlyDeleteTask };
