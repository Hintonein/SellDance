const { recallAssets } = require('./asset.service');
async function matchAssetsForScene(projectId, scene = {}, options = {}) {
  return recallAssets(projectId, {
    keyword: options.keyword || scene.visualDescription || scene.scriptText || scene.subtitle || '',
    tags: options.tags || scene.tags || [],
    purpose: 'storyboard',
    limit: options.limit || 3,
  });
}
async function matchAssetsForStoryboard(projectId, scenes = [], options = {}) {
  const matches = [];
  for (const scene of scenes) {
    matches.push({ sceneId: scene.sceneId || scene.id, matches: await matchAssetsForScene(projectId, scene, options) });
  }
  return { items: matches, total: matches.length, mode: 'keyword_tag_mock' };
}
module.exports = { matchAssetsForScene, matchAssetsForStoryboard };
