const router = require('express').Router({ mergeParams: true });
const {
  getScript,
  listScripts,
  updateScript,
  regenerateScript,
  regenerateScriptScene,
  generateAndSaveScript,
} = require('../services/script.service');

router.get('/', async (req, res) => res.json(await listScripts(req.params.projectId)));
router.post('/generate', async (req, res) => res.status(201).json(await generateAndSaveScript(req.params.projectId, req.body || {})));
router.get('/:scriptId', async (req, res) => {
  const script = await getScript(req.params.projectId);
  if (!script || ![script.id, script.scriptId].includes(req.params.scriptId)) return res.status(404).json({ message: 'Script not found.' });
  return res.json(script);
});
router.patch('/:scriptId', async (req, res) => {
  const script = await updateScript(req.params.projectId, req.params.scriptId, req.body || {});
  if (!script) return res.status(404).json({ message: 'Script not found.' });
  return res.json(script);
});
router.post('/:scriptId/refine', async (req, res) => {
  const current = await getScript(req.params.projectId);
  if (!current) return res.status(404).json({ message: 'Script not found.' });
  const script = await regenerateScript(req.params.projectId, req.params.scriptId, { ...(current.input || {}), prompt: req.body.prompt || '', refinePrompt: req.body.prompt || '' });
  return res.json(script);
});
router.post('/:scriptId/regenerate', async (req, res) => {
  const script = await regenerateScript(req.params.projectId, req.params.scriptId, req.body || {});
  if (!script) return res.status(404).json({ message: 'Script not found.' });
  return res.json(script);
});
router.post('/:scriptId/scenes/:sceneId/regenerate', async (req, res) => {
  const script = await regenerateScriptScene(req.params.projectId, req.params.scriptId, req.params.sceneId, req.body || {});
  if (!script) return res.status(404).json({ message: 'Script scene not found.' });
  return res.json(script);
});

module.exports = router;
