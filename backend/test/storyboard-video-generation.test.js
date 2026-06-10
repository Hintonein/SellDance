const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const { PROJECT_ASSET_LINKS_DIR } = require('../src/config/paths');
const { appendAsset, deleteGlobalAsset } = require('../src/services/asset.service');
const {
  clampSceneConcurrency,
  generateStoryboardSceneVideos,
} = require('../src/services/storyboard-video-generation.service');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('storyboard video generation clamps concurrency and binds generated assets', async () => {
  assert.equal(clampSceneConcurrency(), 3);
  assert.equal(clampSceneConcurrency(10), 5);
  assert.equal(clampSceneConcurrency(0), 3);

  let active = 0;
  let maxActive = 0;
  const storyboard = {
    id: 'storyboard_test',
    storyboardId: 'storyboard_test',
    aspectRatio: '9:16',
    scenes: Array.from({ length: 7 }, (_, index) => ({
      id: `scene_${index + 1}`,
      order: index + 1,
      sceneRole: index === 0 ? 'hook' : 'selling_point',
      duration: 2,
      visualDescription: `Scene ${index + 1}`,
      subtitle: `S${index + 1}`,
      selectedAssetIds: [`source_asset_${index + 1}`],
      sourceReferenceAssetIds: [`source_asset_${index + 1}`],
      seedancePrompt: `Seed2 planned prompt for scene ${index + 1}`,
    })),
  };

  const progress = [];
  const result = await generateStoryboardSceneVideos('project_test', storyboard, { sceneConcurrency: 10 }, {
    onProgress: async (patch) => progress.push(patch),
    generateSceneAsset: async (_projectId, payload) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await wait(5);
      active -= 1;
      const index = Number(String(payload.metadata.storyboardSceneId).split('_').at(-1));
      return {
        output: {
          id: `storyboard_output_${index}`,
          outputId: `storyboard_output_${index}`,
          fileUrl: `/uploads/test/scene_${index}.mp4`,
        },
        remoteTaskId: `remote_${index}`,
        model: 'seedance-1.5-pro',
        durationSec: 5,
        requestedDurationSec: payload.durationSec,
      };
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.generatedAssetIds.length, 0);
  assert.equal(result.generatedOutputIds.length, 7);
  assert.equal(result.failedSceneIds.length, 0);
  assert.equal(result.scenes[0].generationStatus, 'ready');
  assert.equal(result.scenes[0].selectedAssetIds[0], 'source_asset_1');
  assert.equal(result.scenes[0].generatedAssetId, null);
  assert.equal(result.scenes[0].generatedOutputId, 'storyboard_output_1');
  assert.equal(result.scenes[0].generatedVideoUrl, '/uploads/test/scene_1.mp4');
  assert.match(result.scenes[0].generationPrompt, /Seed2 planned prompt/);
  assert.equal(result.scenes[0].requestedDurationSec, 2);
  assert.equal(result.scenes[0].seedanceDurationSec, 5);
  assert.match(result.scenes[0].generationDurationNote, /trim to 2s/);
  assert.ok(maxActive <= 5);
  assert.ok(progress.some((item) => item.runningScenes > 0));
});

test('storyboard video generation passes product image as identity reference with consistency rules', async () => {
  const projectId = `test-storyboard-reference-${Date.now()}`;
  await deleteGlobalAsset('asset_product_reference', { projectIds: [projectId] }).catch(() => null);
  await fs.rm(path.join(PROJECT_ASSET_LINKS_DIR, `${projectId}.json`), { force: true });
  await appendAsset(projectId, {
    id: 'asset_product_reference',
    type: 'image',
    mediaType: 'image',
    assetType: 'product_image',
    source: 'upload',
    title: 'Product bottle reference',
    fileUrl: '/uploads/test/product-reference.jpg',
    mimeType: 'image/jpeg',
    tags: ['product', 'bottle'],
    analysisStatus: 'completed',
  });

  let referenceImages = null;
  const result = await generateStoryboardSceneVideos(projectId, {
    id: 'storyboard_test',
    storyboardId: 'storyboard_test',
    aspectRatio: '9:16',
    scenes: [
      {
        id: 'scene_reference',
        order: 1,
        sceneRole: 'hook',
        duration: 2,
        primaryProductAssetId: 'asset_product_reference',
        sourceReferenceAssetIds: ['asset_product_reference'],
        selectedAssetIds: ['asset_product_reference'],
        seedancePrompt: 'Show the same product naturally in a summer usage scene with the same bottle label.',
        sceneContinuityNotes: 'Keep the exact bottle label, green cap, and package scale consistent.',
        sceneDiversityInstruction: 'Use a garden usage scene with handheld motion, not the uploaded asset background.',
      },
    ],
    storyboardConsistency: {
      productIdentity: 'Same mosquito repellent floral water bottle, same label and green cap.',
      brandVisualStyle: 'Fresh summer commercial realism.',
      worldSetting: 'Scene environments come from the script, not reference asset backgrounds.',
      characterContinuity: 'Keep product size and label readable.',
      cameraLanguage: 'Varied handheld e-commerce shots.',
      doNotCopyFromAssets: ['background', 'lighting', 'camera angle', 'composition'],
    },
  }, {}, {
    generateSceneAsset: async (_projectId, payload) => {
      referenceImages = payload.referenceImages;
      return {
        output: {
          id: 'storyboard_output_reference',
          outputId: 'storyboard_output_reference',
          fileUrl: '/outputs/test/storyboards/storyboard_test/scene_reference.mp4',
        },
        model: 'seedance-1.5-pro',
        durationSec: 5,
      };
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(referenceImages[0].role, 'product_reference');
  assert.equal(referenceImages[0].assetId, 'asset_product_reference');
  assert.match(result.scenes[0].generationPrompt, /Global product identity/);
  assert.match(result.scenes[0].generationPrompt, /Scene continuity notes/);
  assert.match(result.scenes[0].generationPrompt, /Scene diversity instruction/);
  assert.match(result.scenes[0].generationPrompt, /Do not copy the reference asset background/);
  assert.doesNotMatch(result.scenes[0].generationPrompt, /early_or_center|natural_presence|opening frame|first[-_ ]frame/i);

  await deleteGlobalAsset('asset_product_reference', { projectIds: [projectId] }).catch(() => null);
  await fs.rm(path.join(PROJECT_ASSET_LINKS_DIR, `${projectId}.json`), { force: true });
});
