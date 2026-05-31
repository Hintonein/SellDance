const router = require('express').Router();
const svc = require('../services/template.service');
router.get('/', async (req, res) => res.json(await svc.listTemplates(req.query || {})));
router.post('/', async (req, res) => res.status(201).json(await svc.createTemplate(req.body || {})));
router.post('/mine', async (req, res) => res.status(201).json(await svc.mineTemplate(req.body || {})));
router.get('/:templateId', async (req, res) => { const item = await svc.getTemplate(req.params.templateId); if (!item) return res.status(404).json({ message: 'Template not found.' }); res.json(item); });
router.patch('/:templateId', async (req, res) => { const item = await svc.updateTemplate(req.params.templateId, req.body || {}); if (!item) return res.status(404).json({ message: 'Template not found.' }); res.json(item); });
router.delete('/:templateId', async (req, res) => { const item = await svc.deleteTemplate(req.params.templateId); if (!item) return res.status(404).json({ message: 'Template not found.' }); res.json({ success: true, deletedId: item.id }); });
module.exports = router;
