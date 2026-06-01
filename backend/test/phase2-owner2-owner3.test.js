const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const app = require('../src/app');
const {
  ASSETS_DIR,
  SCRIPTS_DIR,
  STORYBOARDS_DIR,
  TASKS_DIR,
  ASSET_SLICES_FILE,
  EDITING_PLANS_FILE,
  REFERENCE_VIDEOS_FILE,
  TEMPLATES_FILE,
  UPLOADS_DIR,
  OUTPUTS_DIR,
} = require('../src/config/paths');
const { appendAsset, normalizeAsset } = require('../src/services/asset.service');
const { createSlice } = require('../src/services/asset-slice.service');
const { createEditingPlan } = require('../src/services/creation-planning.service');
const { createReferenceVideo, analyzeReferenceVideo } = require('../src/services/reference-video.service');
const { mineTemplate } = require('../src/services/template.service');
const { curateTags } = require('../src/services/asset-tag.service');
const modelProvider = require('../src/services/model-provider.service');
const videoTask = require('../src/services/video-task.service');

async function hasBinary(name) {
  try {
    await execFileAsync(name, ['-version']);
    return true;
  } catch {
    return false;
  }
}

async function cleanupProject(projectId) {
  await fs.rm(path.join(ASSETS_DIR, `${projectId}.json`), { force: true });
  await fs.rm(path.join(SCRIPTS_DIR, `${projectId}.json`), { force: true });
  await fs.rm(path.join(STORYBOARDS_DIR, `${projectId}.json`), { force: true });
  await fs.rm(path.join(UPLOADS_DIR, 'test', projectId), { recursive: true, force: true });
  await fs.rm(path.join(OUTPUTS_DIR, projectId), { recursive: true, force: true });
  for (const filePath of [ASSET_SLICES_FILE, EDITING_PLANS_FILE]) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const rows = JSON.parse(raw || '[]').filter((row) => row.projectId !== projectId);
      await fs.writeFile(filePath, JSON.stringify(rows, null, 2));
    } catch {
      // no-op
    }
  }
  try {
    const files = await fs.readdir(TASKS_DIR);
    await Promise.all(files.map(async (file) => {
      if (!file.endsWith('.json')) return;
      const filePath = path.join(TASKS_DIR, file);
      const task = JSON.parse(await fs.readFile(filePath, 'utf8'));
      if (task.projectId === projectId) await fs.rm(filePath, { force: true });
    }));
  } catch {
    // no-op
  }
}

async function withServer(fn) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  try {
    return await fn(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function jsonFetch(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function appendTestImage(projectId, assetId = 'asset_closeup') {
  const imagePath = path.join(UPLOADS_DIR, 'test', projectId, `${assetId}.jpg`);
  await fs.mkdir(path.dirname(imagePath), { recursive: true });
  await fs.writeFile(imagePath, Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2w==', 'base64'));
  return appendAsset(projectId, {
    id: assetId,
    projectId,
    type: 'image',
    mediaType: 'image',
    source: 'upload',
    title: 'Close up product detail',
    fileUrl: `/uploads/test/${projectId}/${assetId}.jpg`,
    mimeType: 'image/jpeg',
    tags: ['product', 'close_up', 'detail', 'feature'],
    analysisStatus: 'completed',
    analysis: { summary: 'Close-up product detail image.', tags: ['product', 'close_up', 'detail'] },
  });
}

async function appendRenderableImage(projectId, assetId = 'asset_render') {
  const imagePath = path.join(UPLOADS_DIR, 'test', projectId, `${assetId}.png`);
  await fs.mkdir(path.dirname(imagePath), { recursive: true });
  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'color=c=white:s=320x480:d=0.1',
    '-frames:v', '1',
    imagePath,
  ]);
  return appendAsset(projectId, {
    id: assetId,
    projectId,
    type: 'image',
    mediaType: 'image',
    source: 'upload',
    title: 'Renderable product image',
    fileUrl: `/uploads/test/${projectId}/${assetId}.png`,
    mimeType: 'image/png',
    tags: ['product', 'close_up'],
    analysisStatus: 'completed',
    analysis: { summary: 'Renderable product image.', tags: ['product', 'close_up'] },
  });
}

async function pollTask(taskId, predicate, timeoutMs = 8000) {
  const started = Date.now();
  let task = await videoTask.getTask(taskId);
  while (Date.now() - started < timeoutMs) {
    task = await videoTask.getTask(taskId);
    if (predicate(task)) return task;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return task;
}

test('Phase 2 Owner 2 APIs generate structured scripts and storyboards with recall fallback', async () => {
  const projectId = `test-owner2-${Date.now()}`;
  await cleanupProject(projectId);
  await appendTestImage(projectId);

  await withServer(async (baseUrl) => {
    const script = await jsonFetch(baseUrl, `/projects/${projectId}/scripts/generate`, {
      method: 'POST',
      body: JSON.stringify({
        productInfo: 'Leakproof travel tumbler',
        sellingPoints: ['leakproof lid', 'close-up steel detail'],
        audience: 'commuters',
        style: 'clean_ecommerce',
      }),
    });
    assert.equal(script.projectId, projectId);
    assert.ok(script.scenes.length >= 4);
    assert.ok(script.scenes[0].duration);
    assert.ok(script.scenes[0].visualDescription);
    assert.ok(script.scenes[0].subtitle);
    assert.ok(script.scenes[0].voiceover);

    const regenerated = await jsonFetch(baseUrl, `/projects/${projectId}/scripts/${script.id}/scenes/${script.scenes[0].id}/regenerate`, {
      method: 'POST',
      body: JSON.stringify({ prompt: 'make the hook more urgent' }),
    });
    assert.equal(regenerated.scenes[0].sceneRole, 'hook');

    const transitionScript = await jsonFetch(baseUrl, `/projects/${projectId}/scripts/${script.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...regenerated,
        scenes: [{ ...regenerated.scenes[0], sceneRole: 'transition', duration: 1.5 }],
      }),
    });
    assert.equal(transitionScript.scenes[0].sceneRole, 'transition');

    const storyboard = await jsonFetch(baseUrl, `/projects/${projectId}/storyboards/generate`, {
      method: 'POST',
      body: JSON.stringify({ scriptId: script.id, scenes: regenerated.scenes }),
    });
    assert.ok(storyboard.scenes.length >= 4);
    assert.ok(storyboard.scenes[0].assetRequirements);
    assert.ok(Array.isArray(storyboard.scenes[0].candidateAssets));
    assert.ok(Array.isArray(storyboard.scenes[0].candidateSlices));

    const patched = await jsonFetch(baseUrl, `/projects/${projectId}/storyboards/${storyboard.id}/scenes/${storyboard.scenes[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ subtitle: 'Updated subtitle', selectedAssetIds: ['asset_closeup'] }),
    });
    assert.equal(patched.scenes[0].subtitle, 'Updated subtitle');
    assert.deepEqual(patched.scenes[0].selectedAssetIds, ['asset_closeup']);
    await assert.rejects(
      () => jsonFetch(baseUrl, `/projects/${projectId}/storyboards/${storyboard.id}/scenes/not-a-scene`, {
        method: 'PATCH',
        body: JSON.stringify({ subtitle: 'Should fail' }),
      }),
      (error) => error.status === 404,
    );
  });

  const emptyProjectId = `${projectId}-empty`;
  await cleanupProject(emptyProjectId);
  await withServer(async (baseUrl) => {
    const script = await jsonFetch(baseUrl, `/projects/${emptyProjectId}/scripts/generate`, {
      method: 'POST',
      body: JSON.stringify({ productInfo: 'No asset product', sellingPoints: ['simple benefit'] }),
    });
    const storyboard = await jsonFetch(baseUrl, `/projects/${emptyProjectId}/storyboards/generate`, {
      method: 'POST',
      body: JSON.stringify({ scriptId: script.id, scenes: script.scenes }),
    });
    assert.ok(storyboard.scenes[0].fallbackReason);
    assert.deepEqual(storyboard.scenes[0].candidateAssets, []);
  });

  await cleanupProject(projectId);
  await cleanupProject(emptyProjectId);
});

test('Phase 3 Owner 2 MVP keeps reference/template/script providers behind service boundaries', async () => {
  const reference = await createReferenceVideo({
    sourcePlatform: 'tiktok',
    sourceUrl: 'https://example.com/public-video',
    sourceDeclaration: 'Structured analysis only; do not download, copy, remix, or reuse original content.',
    category: 'beauty',
    title: 'Public reference structure',
  });
  const analyzed = await analyzeReferenceVideo(reference.id, { sellingPoints: ['texture proof'] });
  assert.equal(analyzed.sourceUrl, reference.sourceUrl);
  assert.ok(analyzed.sourceDeclaration.includes('Structured analysis only'));
  assert.ok(analyzed.analysisReport);
  assert.ok(Array.isArray(analyzed.reusableFactors));

  const template = await mineTemplate({
    category: 'beauty',
    referenceReports: [analyzed],
  });
  assert.equal(template.category, 'beauty');
  assert.ok(template.strategy);
  assert.ok(template.factors.length >= 1);

  const structured = await modelProvider.generateStructuredScript({
    projectId: 'phase3-preview',
    productInfo: 'Summer sunscreen',
    sellingPoints: ['light texture'],
    mode: 'template',
  }, { provider: 'mock' });
  assert.ok(structured.scenes.length >= 1);
  assert.equal(structured.mode, 'template');

  const previousKey = process.env.ARK_API_KEY;
  const previousEndpoint = process.env.SEED_ENDPOINT_ID;
  delete process.env.ARK_API_KEY;
  delete process.env.SEED_ENDPOINT_ID;
  try {
    await assert.rejects(
      () => modelProvider.generateStructuredScript({ productInfo: 'Seed2 missing env' }, { provider: 'seed2' }),
      /ARK_API_KEY and SEED_ENDPOINT_ID/,
    );
  } finally {
    if (previousKey === undefined) delete process.env.ARK_API_KEY;
    else process.env.ARK_API_KEY = previousKey;
    if (previousEndpoint === undefined) delete process.env.SEED_ENDPOINT_ID;
    else process.env.SEED_ENDPOINT_ID = previousEndpoint;
    for (const [filePath, id] of [[REFERENCE_VIDEOS_FILE, reference.id], [TEMPLATES_FILE, template.id]]) {
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const rows = JSON.parse(raw || '[]').filter((row) => row.id !== id);
        await fs.writeFile(filePath, JSON.stringify(rows, null, 2));
      } catch {
        // no-op
      }
    }
  }
});

test('asset tags are ordered by business importance and low-value generation labels are dropped', () => {
  const tags = curateTags([
    'AI生成',
    '商品展示',
    '电商短视频',
    '功能饮料',
    '棚拍产品视频',
    '提神饮品',
    'TikTok Shop带货',
    '竖屏短平快素材',
  ]);
  assert.deepEqual(tags.slice(0, 3), ['functional_drink', 'energy_drink', 'studio_product_video']);
  assert.ok(!tags.includes('ai_generated'));
  assert.ok(!tags.includes('product_showcase'));
  assert.ok(tags.length <= 10);

  const normalizedAsset = normalizeAsset('tag-project', {
    id: 'asset_tags',
    type: 'video',
    mediaType: 'video',
    source: 'ai',
    analysis: { tags: ['AI生成', '商品展示', '功能饮料', '提神饮品'] },
  });
  assert.deepEqual(normalizedAsset.analysis.tags.slice(0, 2), ['functional_drink', 'energy_drink']);
  assert.ok(!normalizedAsset.analysis.tags.includes('ai_generated'));
});

test('Phase 2 Owner 3 creates asset-first EditingPlan, validates project ownership, and supports task lifecycle', async () => {
  const projectId = `test-owner3-${Date.now()}`;
  const otherProjectId = `${projectId}-other`;
  await cleanupProject(projectId);
  await cleanupProject(otherProjectId);
  const asset = await appendTestImage(projectId, 'asset_plan');
  const slice = await createSlice(projectId, asset.id, {
    id: 'slice_plan',
    startTime: 0,
    endTime: 4,
    duration: 4,
    visualDescription: 'Detail slice',
    tags: ['detail', 'product'],
  });
  await appendTestImage(otherProjectId, 'asset_foreign');

  const plan = await createEditingPlan(projectId, {
    mode: 'asset_first',
    selectedAssetIds: [asset.id],
    selectedAssetSliceIds: [slice.id],
    targetDuration: 30,
    aspectRatio: '9:16',
  });
  assert.equal(plan.mode, 'asset_first');
  assert.equal(plan.targetDuration, 15);
  assert.ok(plan.clips.length >= 1);
  assert.ok(plan.metadata.duration <= 15);
  assert.deepEqual(plan.usedAssetIds, [asset.id]);
  assert.deepEqual(plan.usedAssetSliceIds, [slice.id]);

  const sliceOnlyPlan = await createEditingPlan(projectId, {
    mode: 'asset_first',
    selectedAssetSliceIds: [slice.id],
  });
  assert.deepEqual(sliceOnlyPlan.usedAssetSliceIds, [slice.id]);

  await assert.rejects(
    () => createEditingPlan(projectId, { mode: 'asset_first', selectedAssetIds: ['asset_foreign'] }),
    /does not belong to project/,
  );

  const cancelTask = await videoTask.createTask(projectId, { editingPlan: plan });
  const canceled = await videoTask.cancelTask(cancelTask.id);
  assert.equal(canceled.status, 'canceled');

  const failedTask = await videoTask.createTask(projectId, { editingPlanId: 'missing_plan' });
  const failed = await pollTask(failedTask.id, (task) => task?.status === 'failed');
  assert.equal(failed.status, 'failed');
  assert.ok(failed.errorMessage);
  const retried = await videoTask.retryTask(failed.id);
  assert.ok(['queued', 'processing', 'rendering', 'running', 'failed'].includes(retried.status));
  assert.equal(retried.retries, 1);

  await cleanupProject(projectId);
  await cleanupProject(otherProjectId);
});

test('Phase 2 Owner 3 render task records output metadata from EditingPlan', async (t) => {
  if (!(await hasBinary('ffmpeg'))) {
    t.skip('FFmpeg not available');
    return;
  }
  const projectId = `test-owner3-render-${Date.now()}`;
  await cleanupProject(projectId);
  const asset = await appendRenderableImage(projectId, 'asset_render');
  const plan = await createEditingPlan(projectId, {
    mode: 'asset_first',
    selectedAssetIds: [asset.id],
    targetDuration: 2,
  });
  const task = await videoTask.createTask(projectId, { editingPlan: plan });
  const completed = await pollTask(task.id, (row) => ['completed', 'failed'].includes(row?.status), 12000);
  assert.equal(completed.status, 'completed', completed.errorMessage);
  assert.ok(completed.outputVideoUrl);
  assert.deepEqual(completed.outputMetadata.usedAssetIds, [asset.id]);
  assert.equal(completed.outputMetadata.aspectRatio, '9:16');
  assert.ok(completed.outputMetadata.duration <= 15);
  await cleanupProject(projectId);
});
