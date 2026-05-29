const { v4: uuidv4 } = require('uuid');
const { listReferenceVideos: readReferenceVideos, writeReferenceVideos } = require('./storage.service');
function now() { return new Date().toISOString(); }
async function listReferenceVideos(filters = {}) {
  const rows = await readReferenceVideos();
  return rows.filter((item) => !filters.category || item.category === filters.category);
}
async function getReferenceVideo(id) { return (await readReferenceVideos()).find((item) => item.id === id) || null; }
async function createReferenceVideo(payload = {}) {
  const item = { id: `ref_video_${uuidv4()}`, sourcePlatform: payload.sourcePlatform || '', sourceUrl: payload.sourceUrl || '', sourceDeclaration: payload.sourceDeclaration || 'Structured analysis only; original third-party video is not downloaded or reused.', category: payload.category || 'general', title: payload.title || 'Untitled reference', analysisReport: payload.analysisReport || null, hook: payload.hook || '', sellingPoints: payload.sellingPoints || [], storyboard: payload.storyboard || [], style: payload.style || '', reusableFactors: payload.reusableFactors || [], createdAt: now(), updatedAt: now() };
  await writeReferenceVideos([item, ...(await readReferenceVideos())]);
  return item;
}
async function analyzeReferenceVideo(id, payload = {}) {
  const rows = await readReferenceVideos(); let updated = null;
  const next = rows.map((item) => {
    if (item.id !== id) return item;
    updated = { ...item, analysisReport: { provider: 'mock', summary: payload.summary || 'Mock reference video structure analysis.', factors: ['hook', 'product proof', 'CTA'] }, updatedAt: now() };
    return updated;
  });
  if (!updated) return null;
  await writeReferenceVideos(next); return updated;
}
module.exports = { listReferenceVideos, getReferenceVideo, createReferenceVideo, analyzeReferenceVideo };
