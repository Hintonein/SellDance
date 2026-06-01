const { v4: uuidv4 } = require('uuid');
const { readTask, listTasks: listTaskRecords, writeTask } = require('./storage.service');
const { renderProjectVideo, clipsToRenderScenes } = require('./video-render.service');
const { getAsset, listAssets } = require('./asset.service');
const { getEditingPlan } = require('./creation-planning.service');
const { getStoryboard } = require('./storyboard.service');

const runningJobs = new Set();
const stepByStatus = {
  queued: 'analyzing assets',
  processing: 'generating script',
  rendering: 'rendering video',
  running: 'rendering video',
  completed: 'exporting',
  failed: 'failed',
  canceled: 'canceled',
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

async function isCanceled(taskId) {
  const latest = await readTask(taskId);
  return latest?.status === 'canceled';
}

async function assetsForEditingPlan(projectId, plan) {
  const assets = [];
  for (const assetId of plan.usedAssetIds || []) {
    const asset = await getAsset(projectId, assetId);
    if (asset) assets.push(asset);
  }
  return assets;
}

async function assetsForStoryboardRender(projectId) {
  const result = await listAssets(projectId, { limit: 0 });
  return Array.isArray(result.items) ? result.items : [];
}

async function runTask(task) {
  if (runningJobs.has(task.id)) return;
  runningJobs.add(task.id);

  try {
    await updateTaskState(task, { status: 'processing', progress: 5, errorMessage: null });
    if (await isCanceled(task.id)) return;

    let scenes = [];
    let materials = [];
    let renderMetadata = {};
    if (task.options?.editingPlan || task.options?.editingPlanId) {
      const plan = task.options.editingPlan || await getEditingPlan(task.projectId, task.options.editingPlanId);
      if (!plan) throw new Error('EditingPlan not found for render task.');
      scenes = clipsToRenderScenes(plan.clips || []);
      materials = await assetsForEditingPlan(task.projectId, plan);
      renderMetadata = {
        editingPlanId: plan.id,
        usedAssetIds: plan.usedAssetIds || [],
        usedAssetSliceIds: plan.usedAssetSliceIds || [],
        usedScriptId: plan.usedScriptId || null,
        usedStoryboardId: plan.usedStoryboardId || null,
        renderSettings: plan.renderSettings || {},
        aspectRatio: plan.aspectRatio || '9:16',
        duration: plan.metadata?.duration || plan.targetDuration || null,
      };
    } else {
      const storyboard = await getStoryboard(task.projectId);
      scenes = storyboard?.scenes || [];
      materials = await assetsForStoryboardRender(task.projectId);
      renderMetadata = {
        usedAssetIds: [...new Set(scenes.flatMap((scene) => scene.selectedAssetIds || scene.assetRefs || []))],
        usedAssetSliceIds: [...new Set(scenes.flatMap((scene) => scene.selectedAssetSliceIds || []))],
        usedScriptId: task.scriptId || storyboard?.scriptId || null,
        usedStoryboardId: task.storyboardId || storyboard?.id || storyboard?.storyboardId || null,
        renderSettings: task.options?.renderSettings || {},
        aspectRatio: task.options?.aspectRatio || storyboard?.aspectRatio || '9:16',
        duration: scenes.reduce((sum, scene) => sum + Number(scene.duration || scene.durationSeconds || 0), 0),
      };
    }
    if (scenes.length === 0) {
      throw new Error('No scenes or clips are available for rendering.');
    }

    await updateTaskState(task, { status: 'rendering', progress: 10 });
    if (await isCanceled(task.id)) return;

    const rendered = await renderProjectVideo({
      projectId: task.projectId,
      taskId: task.id,
      scenes,
      materials,
      options: task.options || {},
      onProgress: async (progress) => {
        if (await isCanceled(task.id)) return;
        await updateTaskState(task, { status: 'rendering', progress });
      },
    });
    if (await isCanceled(task.id)) return;

    task.outputMetadata = renderMetadata;
    await updateTaskState(task, {
      status: 'completed',
      progress: 100,
      errorMessage: null,
      exportFile: rendered.exportFile,
      videoUrl: rendered.videoUrl,
    });
  } catch (error) {
    if (await isCanceled(task.id)) return;
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
    taskType: options.taskType || 'render',
    editingPlanId: options.editingPlanId || options.editingPlan?.id || null,
    scriptId: options.scriptId || projectId,
    storyboardId: options.storyboardId || projectId,
    retries: 0,
    exportFile: null,
    videoUrl: null,
    outputVideoUrl: null,
    exportPresets: [],
    outputMetadata: null,
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
  if (task.status !== 'failed' && task.rawStatus !== 'failed') return task;

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

async function cancelTask(taskId) {
  const task = await getTask(taskId);
  if (!task) return null;
  if (task.rawStatus === 'completed' || task.status === 'completed' || task.rawStatus === 'failed' || task.status === 'failed') return task;
  const nextTask = {
    ...task,
    status: 'canceled',
    rawStatus: 'canceled',
    currentStep: 'canceled',
    progress: task.progress || 0,
    updatedAt: new Date().toISOString(),
  };
  await persistTask(nextTask);
  runningJobs.delete(taskId);
  return decorateTask(nextTask);
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
    error: task.error || task.errorMessage || null,
  };
}

module.exports = {
  getTask,
  listTasks,
  createTask,
  retryTask,
  cancelTask,
};
