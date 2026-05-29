const router = require('express').Router();
const svc = require('../services/reference-video.service');
router.get('/', async (req, res) => res.json(await svc.listReferenceVideos(req.query || {})));
router.post('/', async (req, res) => res.status(201).json(await svc.createReferenceVideo(req.body || {})));
router.get('/:id', async (req, res) => { const item = await svc.getReferenceVideo(req.params.id); if (!item) return res.status(404).json({ message: 'Reference video not found.' }); res.json(item); });
router.post('/:id/analyze', async (req, res) => { const item = await svc.analyzeReferenceVideo(req.params.id, req.body || {}); if (!item) return res.status(404).json({ message: 'Reference video not found.' }); res.json(item); });
module.exports = router;
