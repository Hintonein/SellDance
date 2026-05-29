const express = require('express');
const multer = require('multer');
const { UPLOADS_DIR } = require('../config/paths');
const { listAssets, createAssetFromUpload, getAsset, updateAsset, deleteAsset, analyzeAsset, getAssetSlices, getAssetSlice, updateAssetSlice, deleteAssetSlice, searchProjectAssets } = require('../services/asset.service');
const upload = multer({ dest: UPLOADS_DIR });
const router = express.Router({ mergeParams: true });
function notFound(res) { return res.status(404).json({ message: 'Material not found.' }); }
router.get('/', async (req, res) => res.json((await listAssets(req.params.projectId, req.query || {})).items || []));
router.post('/', upload.single('file'), async (req, res) => { if (!req.file) return res.status(400).json({ message: 'Please upload a file.' }); res.status(201).json(await createAssetFromUpload(req.params.projectId, req.file, req.body || {})); });
router.post('/search', async (req, res) => res.json(await searchProjectAssets(req.params.projectId, req.body || {})));
router.get('/:materialId/slices', async (req, res) => { const result = await getAssetSlices(req.params.projectId, req.params.materialId); if (!result) return notFound(res); res.json(result); });
router.get('/:materialId/slices/:sliceId', async (req, res) => { const slice = await getAssetSlice(req.params.projectId, req.params.materialId, req.params.sliceId); if (!slice) return res.status(404).json({ message: 'Material slice not found.' }); res.json(slice); });
router.patch('/:materialId/slices/:sliceId', async (req, res) => { const slice = await updateAssetSlice(req.params.projectId, req.params.materialId, req.params.sliceId, req.body || {}); if (!slice) return res.status(404).json({ message: 'Material slice not found.' }); res.json(slice); });
router.delete('/:materialId/slices/:sliceId', async (req, res) => { const slice = await deleteAssetSlice(req.params.projectId, req.params.materialId, req.params.sliceId); if (!slice) return res.status(404).json({ message: 'Material slice not found.' }); res.json({ success: true, deletedId: slice.id }); });
router.get('/:materialId', async (req, res) => { const asset = await getAsset(req.params.projectId, req.params.materialId); if (!asset) return notFound(res); res.json(asset); });
router.patch('/:materialId', async (req, res) => { const asset = await updateAsset(req.params.projectId, req.params.materialId, req.body || {}); if (!asset) return notFound(res); res.json(asset); });
router.delete('/:materialId', async (req, res) => { const asset = await deleteAsset(req.params.projectId, req.params.materialId); if (!asset) return notFound(res); res.json({ success: true, deletedId: asset.id || req.params.materialId }); });
router.post('/:materialId/analyze', async (req, res) => { const asset = await analyzeAsset(req.params.projectId, req.params.materialId); if (!asset) return notFound(res); res.json(asset); });
module.exports = router;
