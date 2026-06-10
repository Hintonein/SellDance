const router = require('express').Router({ mergeParams: true });
const svc = require('../services/crawler.service');

router.get('/', async (req, res) => {
  res.json(await svc.listTasks(req.params.projectId));
});

router.get('/:taskId', async (req, res) => {
  const task = await svc.getTask(req.params.projectId, req.params.taskId);
  if (!task) return res.status(404).json({ message: 'Crawler task not found.' });
  return res.json(task);
});

router.get('/:taskId/logs', async (req, res) => {
  const task = await svc.getTask(req.params.projectId, req.params.taskId);
  if (!task) return res.status(404).json({ message: 'Crawler task not found.' });
  return res.json({ logs: task.logs || [] });
});

router.post('/:taskId/cancel', async (req, res) => {
  const task = await svc.cancelTask(req.params.projectId, req.params.taskId);
  if (!task) return res.status(404).json({ message: 'Crawler task not found.' });
  return res.json(task);
});

module.exports = router;
