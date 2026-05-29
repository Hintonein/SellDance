const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { UPLOADS_DIR } = require('../config/paths');
const { listAssets, createAssetFromUpload, getAsset, updateAsset, deleteAsset, analyzeAsset, getAssetSlices, getAssetSlice, updateAssetSlice, deleteAssetSlice, searchProjectAssets, recallAssets } = require('../services/asset.service');
const { createAssetGenerationTask, getAssetGenerationTask } = require('../services/asset-generation.service');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const upload = multer({ dest: UPLOADS_DIR });
const router = express.Router({ mergeParams: true });
function notFound(res) { return res.status(404).json({ message: 'Asset not found.' }); }
router.get('/', async (req, res) => res.json(await listAssets(req.params.projectId, req.query || {})));
router.post('/', upload.single('file'), async (req, res) => { if (!req.file) return res.status(400).json({ message: 'Please upload a file.' }); res.status(201).json(await createAssetFromUpload(req.params.projectId, req.file, req.body || {})); });
router.post('/search', async (req, res) => res.json(await searchProjectAssets(req.params.projectId, req.body || {})));
router.post('/recall', async (req, res) => res.json(await recallAssets(req.params.projectId, req.body || {})));
router.post('/generate', async (req, res) => {
  const requestId = `asset_gen_req_${Date.now()}`;
  try { const task = await createAssetGenerationTask(req.params.projectId, req.body || {}); return res.status(task.status === 'failed' ? 202 : 201).json(task); }
  catch (error) { console.error('[assets.generate] failed', { requestId, projectId: req.params.projectId, message: error.message, stack: error.stack }); return res.status(500).json({ message: error.message || 'Asset generation request failed.', requestId, route: 'POST /api/projects/:projectId/assets/generate', stack: process.env.NODE_ENV === 'production' ? undefined : error.stack }); }
});
router.get('/generation-tasks/:taskId', async (req, res) => { const task = await getAssetGenerationTask(req.params.projectId, req.params.taskId); if (!task) return res.status(404).json({ message: 'Asset generation task not found.' }); res.json(task); });
router.get('/:assetId/slices', async (req, res) => { const result = await getAssetSlices(req.params.projectId, req.params.assetId); if (!result) return notFound(res); res.json(result); });
router.get('/:assetId/slices/:sliceId', async (req, res) => { const slice = await getAssetSlice(req.params.projectId, req.params.assetId, req.params.sliceId); if (!slice) return res.status(404).json({ message: 'Asset slice not found.' }); res.json(slice); });
router.patch('/:assetId/slices/:sliceId', async (req, res) => { const slice = await updateAssetSlice(req.params.projectId, req.params.assetId, req.params.sliceId, req.body || {}); if (!slice) return res.status(404).json({ message: 'Asset slice not found.' }); res.json(slice); });
router.delete('/:assetId/slices/:sliceId', async (req, res) => { const slice = await deleteAssetSlice(req.params.projectId, req.params.assetId, req.params.sliceId); if (!slice) return res.status(404).json({ message: 'Asset slice not found.' }); res.json({ success: true, deletedId: slice.id }); });
router.get('/:assetId', async (req, res) => { const asset = await getAsset(req.params.projectId, req.params.assetId); if (!asset) return notFound(res); res.json(asset); });
router.patch('/:assetId', async (req, res) => { const asset = await updateAsset(req.params.projectId, req.params.assetId, req.body || {}); if (!asset) return notFound(res); res.json(asset); });
router.delete('/:assetId', async (req, res) => { const asset = await deleteAsset(req.params.projectId, req.params.assetId); if (!asset) return notFound(res); res.json({ success: true, deletedId: asset.id || req.params.assetId }); });
router.post('/:assetId/analyze', async (req, res) => { const asset = await analyzeAsset(req.params.projectId, req.params.assetId); if (!asset) return notFound(res); res.json(asset); });
router.post('/:assetId/reanalyze', async (req, res) => { const asset = await analyzeAsset(req.params.projectId, req.params.assetId); if (!asset) return notFound(res); res.json(asset); });
module.exports = router;
