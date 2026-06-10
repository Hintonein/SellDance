const express = require('express');
const { getRuntimeConfigStatus, saveArkApiKey } = require('../services/runtime-config.service');

const router = express.Router();

router.get('/status', (_req, res) => {
  res.json(getRuntimeConfigStatus());
});

router.post('/login', async (req, res, next) => {
  try {
    const status = await saveArkApiKey(req.body?.arkApiKey || req.body?.apiKey || '');
    res.json({ authenticated: status.arkApiKeyConfigured, ...status });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
