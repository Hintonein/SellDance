const express = require('express');
const { listGlobalAssets, getGlobalAsset, updateAsset, deleteGlobalAsset, analyzeAsset, getAssetSlices } = require('../services/asset.service');

const router = express.Router();

router.get('/', async (req, res) => res.json(await listGlobalAssets(req.query || {})));

router.get('/:assetId', async (req, res) => {
  const asset = await getGlobalAsset(req.params.assetId);
  if (!asset) return res.status(404).json({ message: 'Global asset not found.' });
  res.json(asset);
});

router.patch('/:assetId', async (req, res) => {
  const asset = await updateAsset('global', req.params.assetId, req.body || {});
  if (!asset) return res.status(404).json({ message: 'Global asset not found.' });
  res.json(asset);
});

router.delete('/:assetId', async (req, res) => {
  const asset = await deleteGlobalAsset(req.params.assetId);
  if (!asset) return res.status(404).json({ message: 'Global asset not found.' });
  res.json({ success: true, deletedId: asset.id || req.params.assetId, deleteGlobal: true });
});

router.post('/:assetId/analyze', async (req, res) => {
  const asset = await analyzeAsset('global', req.params.assetId, req.body || {});
  if (!asset) return res.status(404).json({ message: 'Global asset not found.' });
  res.json(asset);
});

router.get('/:assetId/slices', async (req, res) => {
  const result = await getAssetSlices('global', req.params.assetId);
  if (!result) return res.status(404).json({ message: 'Global asset not found.' });
  res.json(result);
});

module.exports = router;
