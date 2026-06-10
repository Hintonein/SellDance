const router = require('express').Router({ mergeParams: true });
const svc = require('../services/creation-workflow-task.service');

router.get('/', async (req, res) => res.json(await svc.listTasks(req.params.projectId)));

router.get('/:taskId', async (req, res) => {
  const task = await svc.getTask(req.params.projectId, req.params.taskId);
  if (!task) return res.status(404).json({ message: 'Creation workflow task not found.' });
  return res.json(task);
});

module.exports = router;
