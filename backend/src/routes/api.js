const express = require('express');
const router = express.Router();

router.use('/health', require('./health.routes'));
router.use('/assets', require('./global-assets.routes'));
router.use('/projects/:projectId/assets', require('./assets.routes'));
router.use('/projects/:projectId/materials', require('./materials.compat.routes'));
router.use('/projects/:projectId/scripts', require('./scripts.routes'));
router.use('/projects/:projectId/inspiration-videos', require('./inspiration-videos.routes'));
router.use('/projects/:projectId/inspiration-templates', require('./inspiration-templates.routes'));
router.use('/projects/:projectId/crawler-tasks', require('./crawler-tasks.routes'));
router.use('/projects/:projectId/inspiration-workflow-tasks', require('./inspiration-workflow-tasks.routes'));
router.use('/projects/:projectId/script-workflow-tasks', require('./script-workflow-tasks.routes'));
router.use('/projects/:projectId/creation-workflow-tasks', require('./creation-workflow-tasks.routes'));
router.use('/projects/:projectId/storyboards', require('./storyboards.routes'));
router.use('/projects/:projectId/creation', require('./creation.routes'));
router.use('/projects/:projectId/generation-tasks', require('./generation-tasks.routes'));
router.use('/templates', require('./templates.routes'));
router.use('/reference-videos', require('./reference-videos.routes'));
router.use('/projects', require('./projects.routes'));

// Legacy top-level video task compatibility.
const { getTask, retryTask } = require('../services/video-task.service');
router.get('/video-tasks/:taskId', async (req, res) => {
  const task = await getTask(req.params.taskId);
  if (!task) return res.status(404).json({ message: 'Task not found.' });
  return res.json(task);
});
router.post('/video-tasks/:taskId/retry', async (req, res) => {
  const task = await retryTask(req.params.taskId);
  if (!task) return res.status(404).json({ message: 'Task not found.' });
  return res.json(task);
});

module.exports = router;
