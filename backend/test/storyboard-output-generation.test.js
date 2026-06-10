const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const { PROJECT_ASSET_LINKS_DIR } = require('../src/config/paths');
const { listAssets } = require('../src/services/asset.service');
const { generateStoryboardSceneAsset } = require('../src/services/asset-generation.service');

async function cleanup(projectId) {
  await fs.rm(path.join(PROJECT_ASSET_LINKS_DIR, `${projectId}.json`), { force: true });
}

test('storyboard scene video generation returns workflow output without adding a project asset', async () => {
  const projectId = `test-storyboard-output-${Date.now()}`;
  await cleanup(projectId);
  const previousArkKey = process.env.ARK_API_KEY;
  delete process.env.ARK_API_KEY;
  const before = await listAssets(projectId);
  let result;
  try {
    result = await generateStoryboardSceneAsset(projectId, {
      prompt: 'Generate a storyboard clip with the exact product visible.',
      durationSec: 2,
      ratio: '9:16',
      assetType: 'storyboard_video',
      persistToAssetLibrary: false,
      classification: {
        provider: 'test',
        enhancedPrompt: 'Generate a storyboard clip with the exact product visible.',
        tags: ['storyboard_video'],
      },
      metadata: {
        storyboardId: 'storyboard_test',
        storyboardSceneId: 'scene_test',
      },
    }, {
      generateMockStoryboardOutput: async () => ({
        publicUrl: '/outputs/test/storyboards/storyboard_test/scene_test.mp4',
        size: 123,
        contentType: 'video/mp4',
      }),
    });
  } finally {
    if (previousArkKey === undefined) delete process.env.ARK_API_KEY;
    else process.env.ARK_API_KEY = previousArkKey;
  }
  const after = await listAssets(projectId);

  assert.equal(result.asset, undefined);
  assert.equal(result.output.isProjectAsset, false);
  assert.equal(result.output.fileUrl, '/outputs/test/storyboards/storyboard_test/scene_test.mp4');
  assert.equal(after.total, before.total);

  await cleanup(projectId);
});
