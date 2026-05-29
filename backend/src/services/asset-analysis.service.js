const { v4: uuidv4 } = require('uuid');

function uniqueList(items) {
  return [...new Set((items || []).map((item) => String(item || '').trim()).filter(Boolean))];
}

function buildMockAnalysis(asset) {
  const title = asset.title || asset.name || asset.originalName || 'asset';
  const isVideo = asset.mediaType === 'video' || asset.type === 'video' || String(asset.mimeType || '').startsWith('video/');
  const product = {
    subject: isVideo ? 'product usage/demo footage' : 'product visual asset',
    category: asset.metadata?.category || asset.assetType || asset.type || 'commerce asset',
    colors: ['white', 'charcoal', 'accent blue'],
    material: 'mock material inference',
    coreSellingPoints: uniqueList(asset.tags || []).slice(0, 3),
    usageScenarios: isVideo ? ['usage demonstration', 'short-form commerce video'] : ['hero image', 'product detail display'],
  };
  const visual = {
    style: isVideo ? 'dynamic product demo' : 'clean product showcase',
    scene: asset.source === 'reference' ? 'reference commerce scene' : 'studio/product context',
    rhythm: isVideo ? 'fast social commerce pacing' : 'static inspection',
    camera: isVideo ? 'push-in, cutaway, detail close-up' : 'front/product close-up',
  };
  const tags = uniqueList([
    ...(asset.tags || []),
    isVideo ? 'video' : 'image',
    asset.source || 'upload',
    'mock-analysis',
  ]);

  return {
    summary: `${title} is a ${isVideo ? 'video' : 'image'} asset prepared for SellDance AIGC video creation.`,
    product,
    visual,
    tags,
    suggestedUseCases: isVideo
      ? ['scene b-roll', 'usage proof', 'product transition shot']
      : ['hero product shot', 'detail insert', 'opening frame'],
    embedding: [0.12, 0.24, 0.36, 0.48],
    vector: [0.12, 0.24, 0.36, 0.48],
    provider: 'mock',
    model: 'mock-asset-analysis-v1',
  };
}

function buildMockSlices(asset) {
  const isVideo = asset.mediaType === 'video' || asset.type === 'video' || String(asset.mimeType || '').startsWith('video/');
  if (!isVideo) return [];
  const now = new Date().toISOString();
  const duration = Number(asset.duration || asset.metadata?.duration || 9);
  const sliceDuration = Math.max(3, Math.min(5, Math.ceil(duration / 3)));
  return [0, 1, 2].map((index) => ({
    id: `slice_${uuidv4()}`,
    projectId: asset.projectId,
    assetId: asset.id,
    startTime: index * sliceDuration,
    endTime: Math.min(duration, (index + 1) * sliceDuration),
    thumbnailUrl: asset.thumbnailUrl || asset.fileUrl || asset.url || '',
    transcript: '',
    visualDescription: `Mock slice ${index + 1}: product-focused shot extracted from ${asset.title || asset.name || 'video asset'}.`,
    tags: uniqueList([...(asset.tags || []), 'mock-slice', `slice-${index + 1}`]),
    embedding: [0.11 + index / 100, 0.22, 0.33, 0.44],
    metadata: { mock: true, sourceAssetTitle: asset.title || asset.name || '' },
    createdAt: now,
    updatedAt: now,
  }));
}

module.exports = {
  buildMockAnalysis,
  buildMockSlices,
};
