const router = require('express').Router({ mergeParams: true });
const { getStoryboard, saveStoryboard, generateAndSaveStoryboard } = require('../services/storyboard.service');
router.get('/', async (req, res) => { const storyboard = await getStoryboard(req.params.projectId); res.json(storyboard ? [storyboard] : []); });
router.post('/generate', async (req, res) => {
  const scriptText = req.body.scriptText || req.body.text || '';
  if (!scriptText) return res.status(400).json({ message: 'scriptText is required.' });
  res.status(201).json(await generateAndSaveStoryboard(req.params.projectId, scriptText));
});
router.get('/:storyboardId', async (req, res) => { const storyboard = await getStoryboard(req.params.projectId); if (!storyboard) return res.status(404).json({ message: 'Storyboard not found.' }); res.json(storyboard); });
router.patch('/:storyboardId/scenes/:sceneId', async (req, res) => {
  const storyboard = await getStoryboard(req.params.projectId); if (!storyboard) return res.status(404).json({ message: 'Storyboard not found.' });
  const scenes = (storyboard.scenes || []).map((scene) => (scene.sceneId === req.params.sceneId || String(scene.sceneOrder) === String(req.params.sceneId) || String(scene.sceneIndex) === String(req.params.sceneId)) ? { ...scene, ...req.body } : scene);
  res.json(await saveStoryboard(req.params.projectId, scenes, 'manual'));
});
router.post('/:storyboardId/scenes/:sceneId/regenerate', async (_req, res) => res.status(501).json({ message: 'Storyboard scene regeneration is a Phase 3 placeholder.' }));
module.exports = router;
