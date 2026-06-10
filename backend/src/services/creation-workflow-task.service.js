const { v4: uuidv4 } = require('uuid');
const { listCreationWorkflowTasks, writeCreationWorkflowTasks } = require('./storage.service');
const { getProject } = require('./project.service');
const { getScript, generateAndSaveScript } = require('./script.service');
const { getStoryboard } = require('./storyboard.service');
const { listTemplates } = require('./inspiration-template.service');
const { listVideos } = require('./inspiration-video.service');
const { generateScriptFromTemplate } = require('./script-generation.service');
const crawler = require('./crawler.service');
const inspirationWorkflow = require('./inspiration-workflow-task.service');
const scriptWorkflow = require('./script-workflow-task.service');
const creationPlanning = require('./creation-planning.service');
const videoTask = require('./video-task.service');

const active = new Set();

function now() {
  return new Date().toISOString();
}

async function saveTask(projectId, task) {
  const rows = await listCreationWorkflowTasks(projectId);
  const exists = rows.some((item) => item.id === task.id);
  await writeCreationWorkflowTasks(projectId, exists ? rows.map((item) => (item.id === task.id ? task : item)) : [task, ...rows]);
}

function log(task, message, level = 'info') {
  task.logs = [...(task.logs || []), { at: now(), level, message: String(message || '').slice(0, 1600) }].slice(-160);
}

async function patchTask(projectId, task, patch = {}) {
  Object.assign(task, patch, { updatedAt: now() });
  await saveTask(projectId, task);
  return task;
}

async function listTasks(projectId) {
  return (await listCreationWorkflowTasks(projectId)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function getTask(projectId, taskId) {
  return (await listCreationWorkflowTasks(projectId)).find((task) => task.id === taskId) || null;
}

async function waitFor(getter, isDone, task, projectId, { timeoutMs = 180000, intervalMs = 1500, stage = 'waiting' } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await getter();
    if (isDone(value)) return value;
    await patchTask(projectId, task, { stage, elapsedMs: Date.now() - startedAt });
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const error = new Error(`${stage} timed out after ${timeoutMs}ms.`);
  error.code = 'CREATION_WORKFLOW_TIMEOUT';
  throw error;
}

function productPayload(project = {}, payload = {}) {
  return {
    productInfo: {
      title: project.productName || project.name || payload.productName || 'Featured product',
      category: project.productCategory || payload.productCategory || 'general commerce',
      sellingPoints: project.sellingPoints || payload.sellingPoints || [],
      targetAudience: project.targetAudience || payload.targetAudience || '',
      platform: project.targetPlatform || payload.platform || 'dy',
    },
    productName: project.productName || project.name || payload.productName,
    productCategory: project.productCategory || payload.productCategory,
    sellingPoints: project.sellingPoints || payload.sellingPoints || [],
    targetAudience: project.targetAudience || payload.targetAudience || '',
    style: project.style || payload.style || '',
    platform: payload.platform || project.targetPlatform || 'dy',
    duration: payload.duration || project.expectedDuration || 15,
    prompt: payload.prompt || 'Generate an original short commerce script for one-click video creation.',
  };
}

async function ensureTemplate(projectId, project, payload, task) {
  const existing = await listTemplates(projectId);
  if (existing.length) {
    log(task, `Using existing methodology template: ${existing[0].name}`);
    return existing[0];
  }

  const keyword = payload.keyword || project.productName || project.name || project.productCategory || '';
  if (!keyword) return null;
  try {
    await patchTask(projectId, task, { stage: 'public_video_search', progress: 12 });
    log(task, `Searching public videos for one-click methodology: ${keyword}`);
    const search = await crawler.startSearch(projectId, {
      platform: payload.platform || 'dy',
      keywords: keyword,
      semanticFilter: payload.semanticFilter || `${keyword} e-commerce selling video`,
      category: project.productCategory || 'general',
      limit: 3,
    });
    const crawlerTask = await waitFor(
      () => crawler.getTask(projectId, search.id),
      (value) => value && ['succeeded', 'partial', 'failed', 'timeout', 'cancelled'].includes(value.status),
      task,
      projectId,
      { timeoutMs: Number(payload.searchTimeoutMs || 240000), stage: 'public_video_search' }
    );
    if (!['succeeded', 'partial'].includes(crawlerTask.status)) {
      log(task, `Public video search skipped: ${crawlerTask.error?.message || crawlerTask.status}`, 'warning');
      return null;
    }

    const videos = (await listVideos(projectId)).slice(0, 3);
    if (!videos.length) return null;
    await patchTask(projectId, task, { stage: 'methodology_generation', progress: 22, sourceVideoIds: videos.map((video) => video.id) });
    log(task, `Analyzing top ${videos.length} public videos for methodology`);
    const workflow = await inspirationWorkflow.startAnalyzeAndTemplate(projectId, {
      videoIds: videos.map((video) => video.id),
      deep: false,
      name: 'One-click video methodology',
      category: project.productCategory || 'general',
    });
    const analyzed = await waitFor(
      () => inspirationWorkflow.getTask(projectId, workflow.id),
      (value) => value && ['completed', 'failed'].includes(value.status),
      task,
      projectId,
      { timeoutMs: Number(payload.methodologyTimeoutMs || 240000), stage: 'methodology_generation' }
    );
    if (analyzed.status !== 'completed') {
      log(task, `Methodology generation skipped: ${analyzed.error?.message || analyzed.status}`, 'warning');
      return null;
    }
    const templates = await listTemplates(projectId);
    return templates.find((tpl) => tpl.id === analyzed.templateId) || templates[0] || null;
  } catch (error) {
    log(task, `Automatic methodology fallback: ${error.message}`, 'warning');
    return null;
  }
}

async function ensureScript(projectId, project, payload, task) {
  const existing = await getScript(projectId);
  if (existing?.scenes?.length) {
    log(task, 'Using existing script.');
    return existing;
  }
  await patchTask(projectId, task, { stage: 'script_generation', progress: 35 });
  const template = await ensureTemplate(projectId, project, payload, task);
  if (template) {
    log(task, `Generating script with methodology template: ${template.name}`);
    await generateScriptFromTemplate(projectId, { ...productPayload(project, payload), templateId: template.id });
  } else {
    log(task, 'Generating script from project information without public-video methodology.');
    await generateAndSaveScript(projectId, productPayload(project, payload));
  }
  return getScript(projectId);
}

async function ensureStoryboard(projectId, payload, task) {
  const storyboard = await getStoryboard(projectId);
  if (storyboard?.scenes?.length) {
    log(task, 'Using existing storyboard.');
    return storyboard;
  }
  await patchTask(projectId, task, { stage: 'storyboard_generation', progress: 48 });
  log(task, 'Generating storyboard videos with existing script workflow.');
  const workflow = await scriptWorkflow.createTask(projectId, {
    type: 'generate_storyboard',
    aspectRatio: payload.aspectRatio || '9:16',
    sceneConcurrency: payload.sceneConcurrency || 3,
  });
  const completed = await waitFor(
    () => scriptWorkflow.getTask(projectId, workflow.id),
    (value) => value && ['completed', 'partial', 'failed'].includes(value.status),
    task,
    projectId,
    { timeoutMs: Number(payload.storyboardTimeoutMs || 900000), stage: 'storyboard_generation', intervalMs: 2500 }
  );
  if (completed.status === 'failed') {
    log(task, `Storyboard generation failed; smart editing will use script/assets fallback: ${completed.error?.message || completed.status}`, 'warning');
  }
  return getStoryboard(projectId);
}

async function runOneClick(projectId, task, payload = {}) {
  if (active.has(task.id)) return;
  active.add(task.id);
  try {
    const project = await getProject(projectId);
    if (!project) {
      const error = new Error('Project not found.');
      error.statusCode = 404;
      throw error;
    }
    log(task, 'One-click video workflow started.');
    await patchTask(projectId, task, { status: 'running', stage: 'preparing', progress: 5 });
    const script = await ensureScript(projectId, project, payload, task);
    await patchTask(projectId, task, { scriptId: script?.scriptId || script?.id || null, progress: 45 });
    const storyboard = await ensureStoryboard(projectId, payload, task);
    await patchTask(projectId, task, { storyboardId: storyboard?.storyboardId || storyboard?.id || null, stage: 'smart_editing', progress: 68 });
    log(task, 'Generating smart editing plan with Seed2.');
    const editingPlan = await creationPlanning.createSmartEditingPlan(projectId, {
      ...payload,
      mode: 'smart_editing',
      subtitleMode: payload.subtitleMode || 'off',
      aspectRatio: payload.aspectRatio || storyboard?.aspectRatio || '9:16',
    });
    await patchTask(projectId, task, { editingPlanId: editingPlan.id, progress: 78 });
    log(task, 'Rendering final clean video without burned-in subtitles.');
    const audioMode = payload.audioMode || editingPlan.renderSettings?.audioMode || (payload.backgroundMusicMixMode === 'replace_source' ? 'uploaded_bgm' : 'preserve_source');
    const renderTask = await videoTask.createTask(projectId, {
      editingPlan,
      editingPlanId: editingPlan.id,
      subtitleMode: editingPlan.renderSettings?.subtitleMode || 'off',
      audioMode,
      backgroundMusicAssetId: payload.backgroundMusicAssetId || null,
      backgroundMusicMixMode: payload.backgroundMusicMixMode || editingPlan.renderSettings?.backgroundMusicMixMode || null,
      backgroundMusicVolume: payload.backgroundMusicVolume || editingPlan.renderSettings?.backgroundMusicVolume || null,
      captionDrafts: editingPlan.captionDrafts || editingPlan.subtitles || [],
      taskType: 'one_click_render',
    });
    await patchTask(projectId, task, { renderTaskId: renderTask.id, stage: 'rendering', progress: 82 });
    const rendered = await waitFor(
      () => videoTask.getTask(renderTask.id),
      (value) => value && ['completed', 'failed', 'canceled'].includes(value.rawStatus || value.status),
      task,
      projectId,
      { timeoutMs: Number(payload.renderTimeoutMs || 600000), stage: 'rendering', intervalMs: 2000 }
    );
    if ((rendered.rawStatus || rendered.status) !== 'completed') {
      throw new Error(rendered.errorMessage || rendered.error || 'Render failed.');
    }
    task.result = {
      scriptId: script?.scriptId || script?.id || null,
      storyboardId: storyboard?.storyboardId || storyboard?.id || null,
      editingPlanId: editingPlan.id,
      renderTaskId: renderTask.id,
      videoUrl: rendered.videoUrl,
      captionUrl: rendered.captionUrl || null,
      audioMode: rendered.audioMode || audioMode,
      hasAudioTrack: rendered.hasAudioTrack,
      backgroundMusicMixMode: rendered.backgroundMusicMixMode || null,
      audioMixSummary: rendered.audioMixSummary || null,
    };
    log(task, 'One-click video workflow completed.', 'success');
    await patchTask(projectId, task, { status: 'completed', stage: 'completed', progress: 100, completedAt: now(), result: task.result });
  } catch (error) {
    log(task, error.message, 'error');
    await patchTask(projectId, task, {
      status: 'failed',
      stage: 'failed',
      error: { message: error.message, code: error.code || null },
      completedAt: now(),
    });
  } finally {
    active.delete(task.id);
  }
}

async function runSmartEditing(projectId, task, payload = {}) {
  if (active.has(task.id)) return;
  active.add(task.id);
  try {
    log(task, 'Smart editing workflow started.');
    await patchTask(projectId, task, { status: 'running', stage: 'collecting_context', progress: 10 });
    await patchTask(projectId, task, { stage: 'planning_with_seed2', progress: 35 });
    const editingPlan = await creationPlanning.createSmartEditingPlan(projectId, {
      ...payload,
      mode: 'smart_editing',
      subtitleMode: payload.subtitleMode || 'off',
      audioMode: payload.audioMode || (payload.backgroundMusicMixMode === 'replace_source' ? 'uploaded_bgm' : 'preserve_source'),
      backgroundMusicMixMode: payload.backgroundMusicMixMode || null,
      backgroundMusicVolume: payload.backgroundMusicVolume || null,
    });
    log(task, `Smart editing plan generated: ${editingPlan.id}`, 'success');
    await patchTask(projectId, task, {
      status: 'completed',
      stage: 'completed',
      progress: 100,
      editingPlanId: editingPlan.id,
      completedAt: now(),
      result: {
        editingPlanId: editingPlan.id,
        editingPlan,
      },
    });
  } catch (error) {
    log(task, error.message, 'error');
    await patchTask(projectId, task, {
      status: 'failed',
      stage: 'failed',
      error: { message: error.message, code: error.code || null },
      completedAt: now(),
    });
  } finally {
    active.delete(task.id);
  }
}

async function createTask(projectId, payload = {}) {
  const type = payload.type || payload.taskType || 'one_click_video';
  const task = {
    id: `creation_workflow_${uuidv4()}`,
    projectId,
    type,
    label: type === 'smart_editing' ? 'Smart editing' : 'One-click video',
    status: 'queued',
    stage: 'queued',
    progress: 0,
    payload,
    logs: [],
    result: null,
    error: null,
    createdAt: now(),
    updatedAt: now(),
  };
  await saveTask(projectId, task);
  if (type === 'one_click_video') runOneClick(projectId, task, payload);
  if (type === 'smart_editing') runSmartEditing(projectId, task, payload);
  return task;
}

module.exports = {
  createTask,
  listTasks,
  getTask,
  runOneClick,
  runSmartEditing,
};
