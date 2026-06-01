const router = require('express').Router({ mergeParams: true });
const { getStoryboard, listStoryboards, generateAndSaveStoryboard, updateScene, regenerateScene } = require('../services/storyboard.service');
router.get('/', async (req, res) => res.json(await listStoryboards(req.params.projectId)));
router.post('/generate', async (req, res) => {
  const hasScriptInput = req.body.scriptId || req.body.scriptText || req.body.text || Array.isArray(req.body.scenes);
  if (!hasScriptInput) return res.status(400).json({ message: 'scriptId, scriptText, or scenes are required.' });
  res.status(201).json(await generateAndSaveStoryboard(req.params.projectId, { ...req.body, scriptText: req.body.scriptText || req.body.text }));
});
router.get('/:storyboardId', async (req, res) => {
  const storyboard = await getStoryboard(req.params.projectId);
  if (!storyboard || ![storyboard.id, storyboard.storyboardId].includes(req.params.storyboardId)) return res.status(404).json({ message: 'Storyboard not found.' });
  return res.json(storyboard);
});
router.patch('/:storyboardId/scenes/:sceneId', async (req, res) => {
  const storyboard = await updateScene(req.params.projectId, req.params.storyboardId, req.params.sceneId, req.body || {});
  if (!storyboard) return res.status(404).json({ message: 'Storyboard scene not found.' });
  return res.json(storyboard);
});
router.post('/:storyboardId/scenes/:sceneId/regenerate', async (req, res) => {
  const storyboard = await regenerateScene(req.params.projectId, req.params.storyboardId, req.params.sceneId, req.body || {});
  if (!storyboard) return res.status(404).json({ message: 'Storyboard scene not found.' });
  return res.json(storyboard);
});
module.exports = router;
