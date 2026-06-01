const router = require('express').Router({ mergeParams: true });
const svc = require('../services/generation-task.service');
router.get('/', async (req, res) => res.json(await svc.listTasks({ projectId: req.params.projectId })));
router.post('/', async (req, res) => res.status(201).json(await svc.createTask({ projectId: req.params.projectId, ...req.body })));
router.get('/:taskId', async (req, res) => { const task = await svc.getTask(req.params.taskId); if (!task || task.projectId !== req.params.projectId) return res.status(404).json({ message: 'Task not found.' }); res.json(task); });
router.post('/:taskId/retry', async (req, res) => { const task = await svc.retryTask(req.params.taskId); if (!task || task.projectId !== req.params.projectId) return res.status(404).json({ message: 'Task not found.' }); res.json(task); });
router.post('/:taskId/cancel', async (req, res, next) => { try { res.json(await svc.cancelTask(req.params.taskId)); } catch (error) { next(error); } });
module.exports = router;
