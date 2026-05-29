const router = require('express').Router();
router.get('/', (_req, res) => res.json({ status: 'ok', service: 'selldance-api' }));
module.exports = router;
