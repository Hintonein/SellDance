const router = require('express').Router({ mergeParams: true });
const crawler = require('../services/crawler.service');
const videos = require('../services/inspiration-video.service');
const analysis = require('../services/video-analysis.service');
const workflow = require('../services/inspiration-workflow-task.service');

router.post('/search', async (req, res) => {
  const task = await crawler.startSearch(req.params.projectId, req.body || {});
  res.status(202).json({ taskId: task.id, status: task.status, task });
});

router.post('/analyze-and-template', async (req, res) => {
  const task = await workflow.startAnalyzeAndTemplate(req.params.projectId, req.body || {});
  res.status(202).json(task);
});

router.get('/', async (req, res) => {
  const rows = await videos.listVideos(req.params.projectId, req.query || {});
  res.json(await Promise.all(rows.map((video) => videos.attachLatestReport(req.params.projectId, video))));
});

router.delete('/', async (req, res) => {
  res.json(await videos.clearVideos(req.params.projectId));
});

router.get('/:videoId', async (req, res) => {
  const video = await videos.getVideo(req.params.projectId, req.params.videoId);
  if (!video) return res.status(404).json({ message: 'Inspiration video not found.' });
  return res.json(await videos.attachLatestReport(req.params.projectId, video));
});

router.post('/:videoId/analyze', async (req, res) => {
  const video = await analysis.startAnalyzeVideo(req.params.projectId, req.params.videoId, req.body || {});
  if (!video) return res.status(404).json({ message: 'Inspiration video not found.' });
  return res.status(202).json(video);
});

router.get('/:videoId/analysis-reports', async (req, res) => {
  res.json(await analysis.listReports(req.params.projectId, { videoId: req.params.videoId }));
});

module.exports = router;
