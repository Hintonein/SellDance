const { v4: uuidv4 } = require('uuid');
const { listScriptWorkflowTasks, writeScriptWorkflowTasks } = require('./storage.service');
const scriptGeneration = require('./script-generation.service');
const scriptService = require('./script.service');
const storyboardService = require('./storyboard.service');
const creationPlanning = require('./creation-planning.service');
const { clampSceneConcurrency, generateStoryboardSceneVideos } = require('./storyboard-video-generation.service');
const { planStoryboardScenesWithSeed2 } = require('./storyboard-scene-planning.service');

function now() {
  return new Date().toISOString();
}

async function saveTask(projectId, task) {
  const rows = await listScriptWorkflowTasks(projectId);
  const exists = rows.some((item) => item.id === task.id);
  const next = exists ? rows.map((item) => (item.id === task.id ? task : item)) : [task, ...rows];
  await writeScriptWorkflowTasks(projectId, next);
  return task;
}

async function updateTask(projectId, task, patch) {
  const next = { ...task, ...patch, updatedAt: now() };
  await saveTask(projectId, next);
  return next;
}

async function listTasks(projectId) {
  return (await listScriptWorkflowTasks(projectId)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function getTask(projectId, taskId) {
  return (await listScriptWorkflowTasks(projectId)).find((task) => task.id === taskId) || null;
}

function createBaseTask(projectId, type, payload = {}) {
  const labels = {
    generate_script: 'Script generation',
    refine_script: 'Script refinement',
    generate_storyboard: 'Storyboard generation',
  };
  return {
    id: `script_task_${uuidv4()}`,
    projectId,
    type,
    label: labels[type] || 'Script workflow',
    status: 'queued',
    stage: 'queued',
    progress: 0,
    payload,
    result: null,
    error: null,
    logs: [],
    createdAt: now(),
    updatedAt: now(),
  };
}

function log(task, message, level = 'info') {
  task.logs = [...(task.logs || []), { level, message, at: now() }].slice(-80);
}

async function updateStoryboardGenerationProgress(projectId, task, patch) {
  const next = {
    ...patch,
    stage: 'seedance_scene_generation',
    progress: Math.min(74, 30 + Math.round(((patch.completedScenes || 0) + (patch.failedScenes || 0)) / Math.max(1, patch.totalScenes || 1) * 40)),
  };
  if (patch.message) log(task, patch.message, patch.message.includes('failed') ? 'error' : 'info');
  return updateTask(projectId, task, next);
}

async function runTask(task) {
  let current = task;
  const { projectId, payload = {} } = task;
  try {
    log(current, `${current.label} started`);
    current = await updateTask(projectId, current, { status: 'running', stage: 'preparing', progress: 10 });

    if (task.type === 'generate_script') {
      current = await updateTask(projectId, current, { stage: 'seed2_script_generation', progress: 35 });
      const generated = await scriptGeneration.generateScriptFromTemplate(projectId, payload);
      const script = await scriptService.getScript(projectId);
      current.result = { generatedScriptId: generated.id, scriptId: script?.scriptId || script?.id || null };
    } else if (task.type === 'refine_script') {
      current = await updateTask(projectId, current, { stage: 'seed2_script_refinement', progress: 35 });
      const scriptId = payload.scriptId;
      const script = await scriptService.regenerateScript(projectId, scriptId, payload);
      if (!script) {
        const error = new Error('Script not found for refinement.');
        error.statusCode = 404;
        throw error;
      }
      current.result = { scriptId: script.scriptId || script.id, selectedVersionId: script.selectedVersionId };
    } else if (task.type === 'generate_storyboard') {
      current = await updateTask(projectId, current, { stage: 'clearing_previous_storyboard', progress: 20 });
      await storyboardService.deleteStoryboard(projectId);
      const sceneConcurrency = clampSceneConcurrency(payload.sceneConcurrency);
      current = await updateTask(projectId, current, { stage: 'storyboard_prompt_building', progress: 25, sceneConcurrency });
      let storyboard = await storyboardService.generateAndSaveStoryboard(projectId, { ...payload, createEditingPlan: false });
      current = await updateTask(projectId, current, {
        stage: 'seed2_scene_planning',
        progress: 28,
        planningScenes: storyboard.scenes?.length || 0,
        plannedScenes: 0,
        lowConfidenceScenes: [],
      });
      log(current, 'Planning scene assets and Seedance prompts with Seed2');
      const planning = await planStoryboardScenesWithSeed2(projectId, storyboard, payload);
      storyboard = await storyboardService.saveStoryboard(projectId, {
        ...storyboard,
        scenes: planning.scenes,
        storyboardConsistency: planning.storyboardConsistency || storyboard.storyboardConsistency || null,
        seed2PlanningProvider: planning.provider,
        seed2PlanningModel: planning.model,
        seed2PlanningError: planning.error || null,
        lowConfidenceScenes: planning.lowConfidenceScenes || [],
      }, 'seed2-scene-planning');
      if (planning.error) log(current, `Seed2 scene planning fallback: ${planning.error}`, 'error');
      current = await updateTask(projectId, current, {
        stage: 'seed2_scene_planning',
        progress: 30,
        plannedScenes: planning.scenes?.length || 0,
        lowConfidenceScenes: planning.lowConfidenceScenes || [],
        planningProvider: planning.provider,
        planningError: planning.error || null,
      });
      current = await updateTask(projectId, current, {
        stage: 'seedance_scene_generation',
        progress: 32,
        totalScenes: storyboard.scenes?.length || 0,
        completedScenes: 0,
        failedScenes: 0,
        runningScenes: 0,
        currentSceneIds: [],
        sceneResults: [],
      });
      const generation = await generateStoryboardSceneVideos(projectId, storyboard, {
        ...payload,
        sceneConcurrency,
        provider: 'seedance_1_5_pro_video',
        storyboardConsistency: planning.storyboardConsistency || storyboard.storyboardConsistency || null,
      }, {
        onProgress: async (patch) => {
          current = await updateStoryboardGenerationProgress(projectId, current, patch);
        },
      });
      storyboard = await storyboardService.saveStoryboard(projectId, {
        ...storyboard,
        storyboardConsistency: planning.storyboardConsistency || storyboard.storyboardConsistency || null,
        scenes: generation.scenes,
        provider: 'seedance_1_5_pro_video',
        model: generation.scenes.find((scene) => scene.model)?.model || null,
        generatedAssetIds: generation.generatedAssetIds,
        generatedOutputIds: generation.generatedOutputIds,
        generationWarnings: [
          ...(planning.error ? [`Seed2 scene planning fallback: ${planning.error}`] : []),
          ...((planning.lowConfidenceScenes || []).map((sceneId) => `Scene ${sceneId} has low Seed2 planning confidence.`)),
          ...generation.failedSceneIds.map((sceneId) => `Scene ${sceneId} failed to generate.`),
        ],
        status: generation.status === 'failed' ? 'failed' : generation.status === 'partial' ? 'partial' : 'ready',
        editingPlanStatus: (generation.generatedOutputIds.length || generation.generatedAssetIds.length) ? 'pending' : 'failed',
      }, 'seedance-storyboard-video-generation');
      if (!generation.generatedOutputIds.length && !generation.generatedAssetIds.length) {
        const error = new Error('Seedance storyboard generation failed for every scene.');
        error.code = 'STORYBOARD_SCENE_GENERATION_FAILED';
        current.result = {
          storyboardId: storyboard.storyboardId || storyboard.id,
          sceneResults: generation.sceneResults,
          failedSceneIds: generation.failedSceneIds,
          generatedOutputIds: generation.generatedOutputIds,
        };
        throw error;
      }
      current = await updateTask(projectId, current, { stage: 'editing_plan_generation', progress: 75 });
      const editingPlan = await creationPlanning.createStoryboardDrivenPlan(projectId, {
        mode: 'storyboard_driven',
        storyboardId: storyboard.storyboardId || storyboard.id,
        scriptId: storyboard.scriptId,
        scenes: storyboard.scenes || [],
        aspectRatio: storyboard.aspectRatio || payload.aspectRatio || '9:16',
        targetDuration: storyboard.totalDuration,
      });
      const savedStoryboard = await storyboardService.saveStoryboard(projectId, {
        ...storyboard,
        editingPlanId: editingPlan.id,
        editingPlanStatus: 'ready',
      }, 'storyboard-editing-plan-ready');
      current.result = {
        storyboardId: savedStoryboard.storyboardId || savedStoryboard.id,
        sceneCount: savedStoryboard.scenes?.length || 0,
        editingPlanId: editingPlan.id,
        editingPlan,
        scriptVersionId: savedStoryboard.scriptVersionId || null,
        generatedAssetIds: generation.generatedAssetIds,
        generatedOutputIds: generation.generatedOutputIds,
        failedSceneIds: generation.failedSceneIds,
        sceneResults: generation.sceneResults,
      };
    } else {
      const error = new Error(`Unsupported script workflow task type: ${task.type}`);
      error.statusCode = 400;
      throw error;
    }

    log(current, `${current.label} completed`, 'success');
    const finalStatus = task.type === 'generate_storyboard' && current.result?.failedSceneIds?.length ? 'partial' : 'completed';
    await updateTask(projectId, current, { status: finalStatus, stage: finalStatus === 'partial' ? 'partial' : 'completed', progress: 100, completedAt: now(), result: current.result });
  } catch (error) {
    log(current, error.message, 'error');
    await updateTask(projectId, current, {
      status: 'failed',
      stage: 'failed',
      progress: current.progress || 0,
      error: { message: error.message, code: error.code || null },
      result: current.result || null,
      completedAt: now(),
    });
  }
}

async function createTask(projectId, payload = {}) {
  const type = payload.type || payload.taskType;
  if (!['generate_script', 'refine_script', 'generate_storyboard'].includes(type)) {
    const error = new Error('type must be generate_script, refine_script, or generate_storyboard.');
    error.statusCode = 400;
    throw error;
  }
  const taskPayload = payload.payload || { ...payload };
  delete taskPayload.type;
  delete taskPayload.taskType;
  const task = createBaseTask(projectId, type, taskPayload);
  await saveTask(projectId, task);
  setTimeout(() => runTask(task), 0);
  return task;
}

module.exports = {
  createTask,
  listTasks,
  getTask,
};
