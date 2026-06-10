const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const {
  PROJECT_ASSET_LINKS_DIR,
  ASSET_SLICES_FILE,
} = require('../src/config/paths');
const { appendAsset, deleteGlobalAsset } = require('../src/services/asset.service');
const { createSlice } = require('../src/services/asset-slice.service');
const { planStoryboardScenesWithSeed2 } = require('../src/services/storyboard-scene-planning.service');

async function cleanup(projectId) {
  await deleteGlobalAsset('asset_lotion', { projectIds: [projectId] }).catch(() => null);
  await fs.rm(path.join(PROJECT_ASSET_LINKS_DIR, `${projectId}.json`), { force: true });
  try {
    const raw = await fs.readFile(ASSET_SLICES_FILE, 'utf8');
    const rows = JSON.parse(raw || '[]').filter((row) => row.projectId !== projectId && row.assetId !== 'asset_lotion');
    await fs.writeFile(ASSET_SLICES_FILE, JSON.stringify(rows, null, 2));
  } catch {
    // no-op
  }
}

test('Seed2 scene planner binds storyboard script, source assets, slices, and Seedance prompt', async () => {
  const projectId = `test-scene-planning-${Date.now()}`;
  await cleanup(projectId);
  await appendAsset(projectId, {
    id: 'asset_lotion',
    type: 'image',
    mediaType: 'image',
    assetType: 'product_image',
    source: 'upload',
    title: 'Mosquito repellent floral water bottle',
    fileUrl: '/uploads/test/lotion.jpg',
    thumbnailUrl: '/uploads/test/lotion.jpg',
    mimeType: 'image/jpeg',
    tags: ['product', 'repellent', 'bottle'],
    analysisStatus: 'completed',
    analysis: {
      summary: 'A green mosquito repellent floral water bottle with visible label and cap.',
      tags: ['product', 'repellent', 'bottle'],
      sellingPoints: ['repels mosquitoes', 'fresh scent'],
    },
  });
  await createSlice(projectId, 'asset_lotion', {
    id: 'slice_lotion_close',
    startTime: 0,
    endTime: 2,
    duration: 2,
    thumbnailUrl: '/uploads/test/lotion-frame.jpg',
    visualDescription: 'Close-up of the floral water bottle label and cap.',
    tags: ['close_up', 'product'],
  });

  const storyboard = {
    id: 'storyboard_test',
    storyboardId: 'storyboard_test',
    scriptId: 'script_test',
    scriptVersionId: 'version_1',
    aspectRatio: '9:16',
    scenes: [
      {
        id: 'scene_1',
        order: 1,
        sceneRole: 'hook',
        duration: 2,
        sellingPoint: 'repels mosquitoes',
        narrativeGoal: 'Show the product immediately and establish summer outdoor need.',
        visualDescription: 'Bottle in hand beside outdoor greenery.',
        cameraMovement: 'quick push-in',
        voiceover: 'Mosquitoes outside? Keep this bottle ready.',
        subtitle: 'Repel mosquitoes fast',
        bgm: 'fresh summer beat',
        selectedAssetIds: ['asset_lotion'],
        selectedAssetSliceIds: ['slice_lotion_close'],
      },
    ],
  };

  let promptPayload = null;
  const result = await planStoryboardScenesWithSeed2(projectId, storyboard, {}, {
    generateJsonWithSeed2: async ({ userPrompt }) => {
      promptPayload = JSON.parse(userPrompt);
      return {
        model: 'seed2-test',
        storyboardConsistency: {
          productIdentity: 'Same green mosquito repellent floral water bottle, same cap, label, and bottle proportions.',
          brandVisualStyle: 'Fresh summer outdoor commercial realism.',
          worldSetting: 'Use each scene script for environment; do not reuse uploaded asset backgrounds.',
          characterContinuity: 'Keep product scale and hand interaction plausible.',
          cameraLanguage: 'Fast push-in for hook, then varied product usage angles.',
          sceneDiversityPlan: ['Scene 1 outdoor greenery handheld hook.'],
          doNotCopyFromAssets: ['background', 'lighting', 'camera angle', 'composition'],
        },
        scenes: [
          {
            sceneId: 'scene_1',
            selectedAssetIds: ['asset_lotion'],
            selectedAssetSliceIds: ['slice_lotion_close'],
            primaryProductAssetId: 'asset_lotion',
            primaryProductReferenceRole: 'product_reference',
            mustShowProductInFrame: true,
            seedancePrompt: 'Use the selected mosquito repellent floral water bottle as the product identity reference. Follow the hook voiceover and show the same bottle label in outdoor greenery.',
            negativePrompt: 'Do not create perfume, skincare, drink bottle, or unrelated product.',
            sceneContinuityNotes: 'Same green bottle label and cap as other scenes; match the hook voiceover.',
            sceneDiversityInstruction: 'Use outdoor greenery and a quick push-in, not the uploaded image background.',
            scriptAlignmentNotes: 'Uses the hook voiceover, subtitle, and outdoor greenery visual.',
            referenceUsage: 'Use asset_lotion as product identity reference.',
            productConsistencyRules: ['same bottle shape', 'same green label', 'same product category'],
            reason: 'The asset and slice show the exact product bottle.',
            confidence: 0.91,
          },
        ],
      };
    },
  });

  assert.equal(promptPayload.storyboard.scenes[0].voiceover, storyboard.scenes[0].voiceover);
  assert.equal(promptPayload.storyboard.scenes[0].subtitle, storyboard.scenes[0].subtitle);
  assert.equal(promptPayload.availableAssets[0].assetId, 'asset_lotion');
  assert.equal(promptPayload.availableSlices[0].sliceId, 'slice_lotion_close');
  assert.equal(result.provider, 'seed2');
  assert.equal(result.scenes[0].seed2PlanningProvider, 'seed2');
  assert.equal(result.scenes[0].seed2PlanningConfidence, 0.91);
  assert.equal(result.scenes[0].primaryProductAssetId, 'asset_lotion');
  assert.equal(result.scenes[0].primaryProductReferenceRole, 'product_reference');
  assert.equal(result.scenes[0].mustShowProductInFrame, true);
  assert.equal(result.scenes[0].productOnScreenTiming, undefined);
  assert.match(result.storyboardConsistency.productIdentity, /green mosquito repellent/);
  assert.match(result.scenes[0].sceneContinuityNotes, /Same green bottle/);
  assert.match(result.scenes[0].sceneDiversityInstruction, /outdoor greenery/);
  assert.deepEqual(result.scenes[0].selectedAssetIds, ['asset_lotion']);
  assert.deepEqual(result.scenes[0].sourceReferenceAssetIds, ['asset_lotion']);
  assert.deepEqual(result.scenes[0].sourceReferenceSliceIds, ['slice_lotion_close']);
  assert.match(result.scenes[0].seedancePrompt, /same bottle label/);
  assert.match(result.scenes[0].seedancePrompt, /product identity reference/);
  assert.match(result.scenes[0].seedancePrompt, /Do not copy the reference asset background/);
  assert.match(result.scenes[0].seedancePrompt, /Scene diversity instruction/);
  assert.doesNotMatch(result.scenes[0].seedancePrompt, /early_or_center|natural_presence|opening frame|first frame|first_frame/i);
  assert.match(result.scenes[0].negativePrompt, /perfume/);

  await cleanup(projectId);
});
