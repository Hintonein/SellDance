const router = require('express').Router({ mergeParams: true });
const { getStoryboard, listStoryboards, generateAndSaveStoryboard, updateScene, reorderScenes, deleteScene, regenerateScene, deleteStoryboard, saveStoryboard } = require('../services/storyboard.service');
const { createStoryboardDrivenPlan } = require('../services/creation-planning.service');
router.get('/', async (req, res) => res.json(await listStoryboards(req.params.projectId)));
router.post('/generate', async (req, res) => {
  const hasScriptInput = req.body.scriptId || req.body.scriptText || req.body.text || Array.isArray(req.body.scenes);
  if (!hasScriptInput) return res.status(400).json({ message: 'scriptId, scriptText, or scenes are required.' });
  let storyboard = await generateAndSaveStoryboard(req.params.projectId, { ...req.body, scriptText: req.body.scriptText || req.body.text });
  let editingPlan = null;
  if (req.body.createEditingPlan) {
    editingPlan = await createStoryboardDrivenPlan(req.params.projectId, {
      mode: 'storyboard_driven',
      storyboardId: storyboard.storyboardId || storyboard.id,
      scriptId: storyboard.scriptId,
      scenes: storyboard.scenes || [],
      aspectRatio: storyboard.aspectRatio || req.body.aspectRatio || '9:16',
      targetDuration: storyboard.totalDuration,
    });
    storyboard = await saveStoryboard(req.params.projectId, {
      ...storyboard,
      scenes: storyboard.scenes,
      editingPlanId: editingPlan.id,
      editingPlanStatus: 'ready',
    }, 'storyboard-editing-plan-ready');
  }
  res.status(201).json(editingPlan ? { ...storyboard, editingPlan } : storyboard);
});
router.get('/:storyboardId', async (req, res) => {
  const storyboard = await getStoryboard(req.params.projectId);
  if (!storyboard || ![storyboard.id, storyboard.storyboardId].includes(req.params.storyboardId)) return res.status(404).json({ message: 'Storyboard not found.' });
  return res.json(storyboard);
});
router.delete('/:storyboardId', async (req, res) => {
  const storyboard = await getStoryboard(req.params.projectId);
  if (!storyboard || ![storyboard.id, storyboard.storyboardId].includes(req.params.storyboardId)) return res.status(404).json({ message: 'Storyboard not found.' });
  return res.json(await deleteStoryboard(req.params.projectId));
});
router.patch('/:storyboardId/scenes/reorder', async (req, res) => {
  const storyboard = await reorderScenes(req.params.projectId, req.params.storyboardId, req.body?.sceneIds || []);
  if (!storyboard) return res.status(404).json({ message: 'Storyboard not found.' });
  return res.json(storyboard);
});
router.patch('/:storyboardId/scenes/:sceneId', async (req, res) => {
  const storyboard = await updateScene(req.params.projectId, req.params.storyboardId, req.params.sceneId, req.body || {});
  if (!storyboard) return res.status(404).json({ message: 'Storyboard scene not found.' });
  return res.json(storyboard);
});
router.delete('/:storyboardId/scenes/:sceneId', async (req, res) => {
  const storyboard = await deleteScene(req.params.projectId, req.params.storyboardId, req.params.sceneId);
  if (!storyboard) return res.status(404).json({ message: 'Storyboard scene not found.' });
  return res.json(storyboard);
});
router.post('/:storyboardId/scenes/:sceneId/regenerate', async (req, res) => {
  const storyboard = await regenerateScene(req.params.projectId, req.params.storyboardId, req.params.sceneId, req.body || {});
  if (!storyboard) return res.status(404).json({ message: 'Storyboard scene not found.' });
  return res.json(storyboard);
});
module.exports = router;
