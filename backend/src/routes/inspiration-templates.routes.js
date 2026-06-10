const router = require('express').Router({ mergeParams: true });
const svc = require('../services/inspiration-template.service');

router.get('/', async (req, res) => {
  res.json(await svc.listTemplates(req.params.projectId, req.query || {}));
});

router.post('/generate', async (req, res) => {
  res.status(201).json(await svc.generateTemplate(req.params.projectId, req.body || {}));
});

router.get('/:templateId', async (req, res) => {
  const template = await svc.getTemplate(req.params.projectId, req.params.templateId);
  if (!template) return res.status(404).json({ message: 'Inspiration template not found.' });
  return res.json(template);
});

router.delete('/:templateId', async (req, res) => {
  const template = await svc.deleteTemplate(req.params.projectId, req.params.templateId);
  if (!template) return res.status(404).json({ message: 'Inspiration template not found.' });
  return res.json({ success: true, deletedId: template.id });
});

module.exports = router;
