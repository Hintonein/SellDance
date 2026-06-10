const router = require('express').Router({ mergeParams: true });
const svc = require('../services/script-workflow-task.service');

router.get('/', async (req, res) => res.json(await svc.listTasks(req.params.projectId)));
router.post('/', async (req, res) => res.status(201).json(await svc.createTask(req.params.projectId, req.body || {})));
router.get('/:taskId', async (req, res) => {
  const task = await svc.getTask(req.params.projectId, req.params.taskId);
  if (!task) return res.status(404).json({ message: 'Script workflow task not found.' });
  return res.json(task);
});

module.exports = router;
