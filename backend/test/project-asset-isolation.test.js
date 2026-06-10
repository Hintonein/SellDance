const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');

const {
  ASSET_SLICES_FILE,
  PROJECT_ASSET_LINKS_DIR,
  UPLOADS_DIR,
} = require('../src/config/paths');
const {
  appendAsset,
  deleteGlobalAsset,
  listAssets,
  recallAssets,
  searchProjectAssets,
} = require('../src/services/asset.service');
const { createSlice } = require('../src/services/asset-slice.service');
const { createEditingPlan } = require('../src/services/creation-planning.service');

async function cleanup(projectIds, assetIds) {
  for (const assetId of assetIds) {
    await deleteGlobalAsset(assetId, { projectIds }).catch(() => null);
  }
  for (const projectId of projectIds) {
    await fs.rm(path.join(PROJECT_ASSET_LINKS_DIR, `${projectId}.json`), { force: true });
    await fs.rm(path.join(UPLOADS_DIR, 'test', projectId), { recursive: true, force: true });
  }
  try {
    const raw = await fs.readFile(ASSET_SLICES_FILE, 'utf8');
    const rows = JSON.parse(raw || '[]').filter((row) => {
      return !projectIds.includes(row.projectId) && !assetIds.includes(row.assetId);
    });
    await fs.writeFile(ASSET_SLICES_FILE, JSON.stringify(rows, null, 2));
  } catch {
    // no-op for empty local data stores
  }
}

async function appendImage(projectId, assetId, title, tags = []) {
  const filePath = path.join(UPLOADS_DIR, 'test', projectId, `${assetId}.jpg`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2w==', 'base64'));
  return appendAsset(projectId, {
    id: assetId,
    type: 'image',
    mediaType: 'image',
    source: 'upload',
    title,
    fileUrl: `/uploads/test/${projectId}/${assetId}.jpg`,
    tags,
    systemTags: tags,
    analysis: {
      summary: title,
      tags,
    },
  });
}

test('project asset queries and slice-only editing plans stay scoped to linked project assets', async () => {
  const suffix = Date.now();
  const projectA = `asset-isolation-a-${suffix}`;
  const projectB = `asset-isolation-b-${suffix}`;
  const assetAId = `asset_isolation_a_${suffix}`;
  const assetBId = `asset_isolation_b_${suffix}`;
  const sharedSliceId = `slice_isolation_shared_${suffix}`;
  const projectIds = [projectA, projectB];
  const assetIds = [assetAId, assetBId];

  await cleanup(projectIds, assetIds);
  try {
    const assetA = await appendImage(projectA, assetAId, 'Project A mosquito repellent bottle', ['repellent', 'project-a']);
    const assetB = await appendImage(projectB, assetBId, 'Project B sunscreen jar', ['sunscreen', 'project-b']);

    await createSlice('global', assetB.id, {
      id: sharedSliceId,
      startTime: 0,
      endTime: 2,
      duration: 2,
      visualDescription: 'Foreign project sunscreen slice',
      tags: ['sunscreen', 'project-b'],
    });
    await createSlice('global', assetA.id, {
      id: sharedSliceId,
      startTime: 1,
      endTime: 3,
      duration: 2,
      visualDescription: 'Owned project repellent slice',
      tags: ['repellent', 'project-a'],
    });

    const projectAAssets = await listAssets(projectA);
    assert.deepEqual((projectAAssets.items || projectAAssets).map((asset) => asset.id), [assetA.id]);

    const crossSearch = await searchProjectAssets(projectA, { keyword: 'sunscreen', limit: 10 });
    assert.equal(crossSearch.items.length, 0);

    const recall = await recallAssets(projectA, { keywords: ['repellent'], topK: 5 });
    assert.deepEqual(recall.items.map((item) => item.asset.id), [assetA.id]);
    assert.ok(recall.items[0].matchedSlices.every((slice) => slice.assetId === assetA.id));

    const plan = await createEditingPlan(projectA, {
      mode: 'asset_first',
      selectedAssetSliceIds: [sharedSliceId],
      targetDuration: 5,
    });
    assert.deepEqual(plan.usedAssetIds, [assetA.id]);
    assert.deepEqual(plan.usedAssetSliceIds, [sharedSliceId]);
    assert.equal(plan.clips[0].assetId, assetA.id);

    await assert.rejects(
      () => createEditingPlan(projectA, {
        mode: 'asset_first',
        selectedAssetSliceIds: [`${sharedSliceId}_missing`],
      }),
      /does not belong to project/,
    );
  } finally {
    await cleanup(projectIds, assetIds);
  }
});
