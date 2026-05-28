const express = require('express');
const multer = require('multer');
const { UPLOADS_DIR } = require('../config/paths');
const {
  listProjects,
  createProject,
  getProject,
  updateProject,
  archiveProject,
} = require('../services/project.service');
const { listMaterials, saveMaterial, getMaterial, deleteMaterial } = require('../services/material.service');
const { getScript, saveScript, generateAndSaveScript } = require('../services/script.service');
const { getStoryboard, saveStoryboard, generateAndSaveStoryboard } = require('../services/storyboard.service');
const { createTask, getTask, listTasks, retryTask } = require('../services/video-task.service');

const upload = multer({ dest: UPLOADS_DIR });
const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'selldance-api' });
});

router.get('/projects', async (_req, res) => {
  res.json(await listProjects());
});

router.post('/projects', async (req, res) => {
  if (!req.body.name && !req.body.projectName && !req.body.productName) {
    return res.status(400).json({ message: 'Project name is required.' });
  }
  const project = await createProject(req.body);
  return res.status(201).json(project);
});

router.get('/projects/:projectId', async (req, res) => {
  const project = await getProject(req.params.projectId);
  if (!project) {
    return res.status(404).json({ message: 'Project not found.' });
  }
  return res.json(project);
});

router.patch('/projects/:projectId', async (req, res) => {
  const project = await updateProject(req.params.projectId, req.body || {});
  if (!project) {
    return res.status(404).json({ message: 'Project not found.' });
  }
  return res.json(project);
});

router.delete('/projects/:projectId', async (req, res) => {
  const project = await archiveProject(req.params.projectId);
  if (!project) {
    return res.status(404).json({ message: 'Project not found.' });
  }
  return res.json(project);
});

router.get('/projects/:projectId/materials', async (req, res) => {
  res.json(await listMaterials(req.params.projectId));
});

router.get('/projects/:projectId/assets', async (req, res) => {
  res.json(await listMaterials(req.params.projectId));
});

router.post('/projects/:projectId/materials', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Please upload a file.' });
  }
  const record = await saveMaterial(req.params.projectId, req.file, req.body.type);
  return res.status(201).json(record);
});

router.post('/projects/:projectId/assets', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Please upload a file.' });
  }
  const record = await saveMaterial(req.params.projectId, req.file, req.body.type);
  return res.status(201).json(record);
});

router.get('/projects/:projectId/assets/:assetId', async (req, res) => {
  const asset = await getMaterial(req.params.projectId, req.params.assetId);
  if (!asset) {
    return res.status(404).json({ message: 'Asset not found.' });
  }
  return res.json(asset);
});

router.delete('/projects/:projectId/assets/:assetId', async (req, res) => {
  const deleted = await deleteMaterial(req.params.projectId, req.params.assetId);
  if (!deleted) {
    return res.status(404).json({ message: 'Asset not found.' });
  }
  return res.status(204).send();
});

router.get('/projects/:projectId/script', async (req, res) => {
  res.json((await getScript(req.params.projectId)) || {});
});

router.get('/projects/:projectId/scripts', async (req, res) => {
  const script = await getScript(req.params.projectId);
  res.json(script ? [script] : []);
});

router.post('/projects/:projectId/script/generate', async (req, res) => {
  const script = await generateAndSaveScript(req.params.projectId, req.body || {});
  res.status(201).json(script);
});

router.post('/projects/:projectId/scripts/generate', async (req, res) => {
  const script = await generateAndSaveScript(req.params.projectId, req.body || {});
  res.status(201).json(script);
});

router.post('/projects/:projectId/scripts/:scriptId/refine', async (req, res) => {
  const current = await getScript(req.params.projectId);
  if (!current) {
    return res.status(404).json({ message: 'Script not found.' });
  }
  const script = await generateAndSaveScript(req.params.projectId, {
    ...(current.input || {}),
    prompt: req.body.prompt || '',
    refinePrompt: req.body.prompt || '',
  });
  res.json(script);
});

router.get('/projects/:projectId/scripts/:scriptId', async (req, res) => {
  const script = await getScript(req.params.projectId);
  if (!script) {
    return res.status(404).json({ message: 'Script not found.' });
  }
  res.json(script);
});

router.put('/projects/:projectId/script', async (req, res) => {
  if (!req.body.scriptText) {
    return res.status(400).json({ message: 'scriptText is required.' });
  }
  const script = await saveScript(req.params.projectId, req.body.scriptText, { source: 'manual' });
  res.json(script);
});

router.get('/projects/:projectId/storyboard', async (req, res) => {
  res.json((await getStoryboard(req.params.projectId)) || { scenes: [] });
});

router.get('/projects/:projectId/storyboards', async (req, res) => {
  const storyboard = await getStoryboard(req.params.projectId);
  res.json(storyboard ? [storyboard] : []);
});

router.post('/projects/:projectId/storyboard/generate', async (req, res) => {
  if (!req.body.scriptText) {
    return res.status(400).json({ message: 'scriptText is required.' });
  }
  const storyboard = await generateAndSaveStoryboard(req.params.projectId, req.body.scriptText);
  res.status(201).json(storyboard);
});

router.post('/projects/:projectId/storyboards/generate', async (req, res) => {
  const script = await getScript(req.params.projectId);
  const scriptVersion = script?.versions?.find((version) => version.versionId === req.body.scriptVersionId);
  const scriptText = req.body.scriptText || scriptVersion?.scriptText || script?.scriptText;
  if (!scriptText) {
    return res.status(400).json({ message: 'scriptText is required.' });
  }
  const storyboard = await generateAndSaveStoryboard(req.params.projectId, scriptText);
  res.status(201).json(storyboard);
});

router.put('/projects/:projectId/storyboard', async (req, res) => {
  if (!Array.isArray(req.body.scenes)) {
    return res.status(400).json({ message: 'scenes must be an array.' });
  }
  const storyboard = await saveStoryboard(req.params.projectId, req.body.scenes, 'manual');
  res.json(storyboard);
});

router.patch('/projects/:projectId/storyboards/:storyboardId/scenes/:sceneId', async (req, res) => {
  const storyboard = await getStoryboard(req.params.projectId);
  if (!storyboard) {
    return res.status(404).json({ message: 'Storyboard not found.' });
  }
  const scenes = (storyboard.scenes || []).map((scene) => {
    const sceneMatches =
      scene.sceneId === req.params.sceneId ||
      String(scene.sceneOrder) === String(req.params.sceneId) ||
      String(scene.sceneIndex) === String(req.params.sceneId);
    return sceneMatches ? { ...scene, ...req.body } : scene;
  });
  const saved = await saveStoryboard(req.params.projectId, scenes, 'manual');
  res.json(saved);
});

router.get('/projects/:projectId/storyboards/:storyboardId', async (req, res) => {
  const storyboard = await getStoryboard(req.params.projectId);
  if (!storyboard) {
    return res.status(404).json({ message: 'Storyboard not found.' });
  }
  res.json(storyboard);
});

router.get('/projects/:projectId/video-tasks', async (req, res) => {
  res.json(await listTasks(req.params.projectId));
});

router.get('/projects/:projectId/tasks', async (req, res) => {
  res.json(await listTasks(req.params.projectId));
});

router.post('/projects/:projectId/video-tasks', async (req, res) => {
  const task = await createTask(req.params.projectId, req.body || {});
  res.status(201).json(task);
});

router.post('/projects/:projectId/tasks', async (req, res) => {
  const task = await createTask(req.params.projectId, req.body || {});
  res.status(201).json(task);
});

router.get('/projects/:projectId/tasks/:taskId', async (req, res) => {
  const task = await getTask(req.params.taskId);
  if (!task || task.projectId !== req.params.projectId) {
    return res.status(404).json({ message: 'Task not found.' });
  }
  res.json(task);
});

router.post('/projects/:projectId/tasks/:taskId/retry', async (req, res) => {
  const task = await retryTask(req.params.taskId);
  if (!task || task.projectId !== req.params.projectId) {
    return res.status(404).json({ message: 'Task not found.' });
  }
  res.json(task);
});

router.get('/video-tasks/:taskId', async (req, res) => {
  const task = await getTask(req.params.taskId);
  if (!task) {
    return res.status(404).json({ message: 'Task not found.' });
  }
  res.json(task);
});

router.post('/video-tasks/:taskId/retry', async (req, res) => {
  const task = await retryTask(req.params.taskId);
  if (!task) {
    return res.status(404).json({ message: 'Task not found.' });
  }
  res.json(task);
});

module.exports = router;
