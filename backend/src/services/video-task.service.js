const { v4: uuidv4 } = require('uuid');
const fs = require('fs/promises');
const path = require('path');
const { OUTPUTS_DIR } = require('../config/paths');
const { readTask, listTasks: listTaskRecords, writeTask, deleteTask: deleteTaskRecord } = require('./storage.service');
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

const deletableStatuses = new Set(['completed', 'failed', 'canceled', 'cancelled']);

async function listTasks(projectId, options = {}) {
  const tasks = await listTaskRecords();
  return tasks
    .filter((task) => task.projectId === projectId)
    .filter((task) => {
      if (options.deletedOnly) return Boolean(task.deletedAt);
      if (options.includeDeleted) return true;
      return !task.deletedAt;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(decorateTask);
}

async function persistTask(task) {
  task.updatedAt = new Date().toISOString();
  await writeTask(task.id, task);
  return task;
}

async function updateTaskState(task, {
  status,
  progress,
  errorMessage,
  exportFile,
  videoUrl,
  captionUrl,
  audioMode,
  hasAudioTrack,
  backgroundMusicMixMode,
  backgroundMusicVolume,
  sourceAudioPreserved,
  audioMixSummary,
}) {
  if (status) task.status = status;
  if (status) task.currentStep = stepByStatus[status] || task.currentStep;
  if (typeof progress === 'number') task.progress = Math.max(0, Math.min(100, Math.round(progress)));
  if (errorMessage !== undefined) task.errorMessage = errorMessage;
  if (exportFile !== undefined) task.exportFile = exportFile;
  if (videoUrl !== undefined) task.videoUrl = videoUrl;
  if (captionUrl !== undefined) task.captionUrl = captionUrl;
  if (audioMode !== undefined) task.audioMode = audioMode;
  if (hasAudioTrack !== undefined) task.hasAudioTrack = hasAudioTrack;
  if (backgroundMusicMixMode !== undefined) task.backgroundMusicMixMode = backgroundMusicMixMode;
  if (backgroundMusicVolume !== undefined) task.backgroundMusicVolume = backgroundMusicVolume;
  if (sourceAudioPreserved !== undefined) task.sourceAudioPreserved = sourceAudioPreserved;
  if (audioMixSummary !== undefined) task.audioMixSummary = audioMixSummary;
  return persistTask(task);
}

async function isCanceled(taskId) {
  const latest = await readTask(taskId);
  return latest?.status === 'canceled';
}

async function assetsForEditingPlan(projectId, plan, options = {}) {
  const assets = [];
  const assetIds = [...new Set([...(plan.usedAssetIds || []), options.backgroundMusicAssetId].filter(Boolean))];
  for (const assetId of assetIds) {
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
      scenes = clipsToRenderScenes(plan.clips || [], {
        renderSettings: plan.renderSettings || {},
        subtitleMode: task.options.subtitleMode || plan.renderSettings?.subtitleMode,
      });
      materials = await assetsForEditingPlan(task.projectId, plan, task.options || {});
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
      task.options = {
        ...task.options,
        renderSettings: plan.renderSettings || {},
        subtitleMode: task.options.subtitleMode || plan.renderSettings?.subtitleMode || 'off',
        audioMode: task.options.audioMode || plan.renderSettings?.audioMode || (task.options.backgroundMusicMixMode === 'replace_source' ? 'uploaded_bgm' : 'preserve_source'),
        backgroundMusicMixMode: task.options.backgroundMusicMixMode || plan.renderSettings?.backgroundMusicMixMode || null,
        backgroundMusicVolume: task.options.backgroundMusicVolume || plan.renderSettings?.backgroundMusicVolume || null,
        captionDrafts: plan.captionDrafts || plan.subtitles || [],
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
      captionUrl: rendered.captionUrl || null,
      audioMode: rendered.audioMode,
      hasAudioTrack: rendered.hasAudioTrack,
      backgroundMusicMixMode: rendered.backgroundMusicMixMode,
      backgroundMusicVolume: rendered.backgroundMusicVolume,
      sourceAudioPreserved: rendered.sourceAudioPreserved,
      audioMixSummary: rendered.audioMixSummary,
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

function assertDeletable(task) {
  const status = task.rawStatus || task.status;
  if (!deletableStatuses.has(status)) {
    const error = new Error('Only completed, failed, or canceled render tasks can be moved to trash.');
    error.statusCode = 400;
    error.code = 'TASK_NOT_DELETABLE';
    throw error;
  }
}

async function moveTaskToTrash(projectId, taskId, payload = {}) {
  const task = await getTask(taskId);
  if (!task || task.projectId !== projectId) return null;
  assertDeletable(task);
  const nextTask = {
    ...task,
    deletedAt: task.deletedAt || new Date().toISOString(),
    deletedBy: 'user',
    deleteReason: payload.reason || task.deleteReason || '',
    updatedAt: new Date().toISOString(),
  };
  await persistTask(nextTask);
  return decorateTask(nextTask);
}

async function restoreTask(projectId, taskId) {
  const task = await getTask(taskId);
  if (!task || task.projectId !== projectId) return null;
  const nextTask = {
    ...task,
    deletedAt: null,
    deletedBy: null,
    deleteReason: '',
    updatedAt: new Date().toISOString(),
  };
  await persistTask(nextTask);
  return decorateTask(nextTask);
}

function outputRefToDiskPath(ref) {
  if (!ref || typeof ref !== 'string') return null;
  const outputRoot = path.resolve(OUTPUTS_DIR);
  let target = '';
  if (ref.startsWith('/outputs/')) {
    target = path.resolve(outputRoot, ref.replace(/^\/outputs\//, ''));
  } else if (ref.startsWith('outputs/')) {
    target = path.resolve(outputRoot, ref.replace(/^outputs\//, ''));
  } else if (path.isAbsolute(ref)) {
    target = path.resolve(ref);
  }
  if (!target) return null;
  if (target !== outputRoot && target.startsWith(`${outputRoot}${path.sep}`)) return target;
  return null;
}

async function deleteOutputFiles(task) {
  const refs = [
    task.videoUrl,
    task.outputVideoUrl,
    task.exportFile,
    task.captionUrl,
    ...(task.exportPresets || []).map((preset) => preset.url),
  ];
  const deletedFiles = [];
  for (const filePath of [...new Set(refs.map(outputRefToDiskPath).filter(Boolean))]) {
    try {
      await fs.rm(filePath, { force: true });
      deletedFiles.push(filePath);
    } catch {
      // Best-effort cleanup; task deletion should still proceed.
    }
  }
  return deletedFiles;
}

async function permanentlyDeleteTask(projectId, taskId) {
  const task = await getTask(taskId);
  if (!task || task.projectId !== projectId) return null;
  assertDeletable(task);
  const deletedFiles = await deleteOutputFiles(task);
  await deleteTaskRecord(task.id);
  return {
    success: true,
    deletedId: task.id,
    deletedFiles,
  };
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
  moveTaskToTrash,
  restoreTask,
  permanentlyDeleteTask,
};
