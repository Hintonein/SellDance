const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const { ASSETS_DIR, ASSET_SLICES_FILE, UPLOADS_DIR } = require('../src/config/paths');
const { appendAsset, analyzeAsset, deleteAsset, searchProjectAssets, recallAssets } = require('../src/services/asset.service');
const { createSlices, listSlices } = require('../src/services/asset-slice.service');
const { sampleRepresentativeFrames, frameDir } = require('../src/services/video-frame-sampling.service');
const { analyzeImageWithSeed2, responsesUrl } = require('../src/providers/volcengine/seed2.client');

async function hasBinary(name) {
  try {
    await execFileAsync(name, ['-version']);
    return true;
  } catch {
    return false;
  }
}

async function createTestVideo(filePath, seconds = 5) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=white:s=320x480:d=${seconds}`,
    '-vf', 'format=yuv420p',
    '-c:v', 'libx264',
    filePath,
  ]);
}

async function cleanupProject(projectId) {
  await fs.rm(path.join(ASSETS_DIR, `${projectId}.json`), { force: true });
  try {
    const raw = await fs.readFile(ASSET_SLICES_FILE, 'utf8');
    const rows = JSON.parse(raw || '[]').filter((slice) => slice.projectId !== projectId);
    await fs.writeFile(ASSET_SLICES_FILE, JSON.stringify(rows, null, 2));
  } catch {
    // no-op
  }
  await fs.rm(path.join(UPLOADS_DIR, 'test', projectId), { recursive: true, force: true });
  await fs.rm(path.join(UPLOADS_DIR, 'derived', 'frames', projectId), { recursive: true, force: true });
}

function withEnv(patch, fn) {
  return async () => {
    const previous = {};
    Object.keys(patch).forEach((key) => { previous[key] = process.env[key]; });
    Object.entries(patch).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    try {
      await fn();
    } finally {
      Object.entries(previous).forEach(([key, value]) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      });
    }
  };
}

test('Seed2 Responses payload uses SEED_ENDPOINT_ID and multimodal content', withEnv({
  ARK_API_KEY: 'test-key',
  ARK_BASE_URL: 'https://ark.cn-beijing.volces.com',
  SEED_ENDPOINT_ID: 'ep-test-seed',
  SEED2_MODEL: 'must-not-be-used',
  SEED2_ENDPOINT_ID: 'must-not-be-used',
}, async () => {
  const imagePath = path.join(UPLOADS_DIR, 'test-seed2-image.jpg');
  await fs.writeFile(imagePath, Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2w==', 'base64'));
  let captured = null;
  const fetchImpl = async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        output_text: '```json\n{"subject":"Bottle","category":"skincare","summary":"A product close-up.","tags":["商品","特写"]}\n```',
      }),
    };
  };
  const result = await analyzeImageWithSeed2({
    asset: { id: 'asset_seed2', mediaType: 'image', title: 'Bottle' },
    imageFile: imagePath,
    fetchImpl,
  });
  assert.equal(captured.url, responsesUrl('https://ark.cn-beijing.volces.com'));
  assert.equal(captured.options.headers.Authorization, 'Bearer test-key');
  assert.equal(captured.body.model, 'ep-test-seed');
  assert.notEqual(captured.body.model, 'must-not-be-used');
  assert.equal(captured.body.input[0].content[0].type, 'input_text');
  assert.equal(captured.body.input[0].content[1].type, 'input_image');
  assert.equal(result.provider, 'seed2');
  assert.equal(result.model, 'ep-test-seed');
  assert.equal(result.subject, 'Bottle');
  await fs.rm(imagePath, { force: true });
}));

test('Seed2 normalization keeps fallback rawText for non-JSON response', withEnv({
  ARK_API_KEY: 'test-key',
  ARK_BASE_URL: 'https://ark.cn-beijing.volces.com/api/v3',
  SEED_ENDPOINT_ID: 'ep-test-seed',
}, async () => {
  const imagePath = path.join(UPLOADS_DIR, 'test-seed2-non-json.jpg');
  await fs.writeFile(imagePath, Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2w==', 'base64'));
  const result = await analyzeImageWithSeed2({
    asset: { id: 'asset_seed2_raw', mediaType: 'image' },
    imageFile: imagePath,
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ output_text: 'plain analysis text' }) }),
  });
  assert.equal(result.provider, 'seed2');
  assert.match(result.rawText, /plain analysis text/);
  assert.ok(result.parseWarning);
  await fs.rm(imagePath, { force: true });
}));

test('Seed2 missing env marks request failure without startup failure', withEnv({
  AI_ASSET_ANALYSIS_PROVIDER: 'seed2',
  ARK_API_KEY: undefined,
  SEED_ENDPOINT_ID: undefined,
}, async () => {
  const projectId = `test-seed2-missing-${Date.now()}`;
  await cleanupProject(projectId);
  const imagePath = path.join(UPLOADS_DIR, 'test', projectId, 'image.svg');
  await fs.mkdir(path.dirname(imagePath), { recursive: true });
  await fs.writeFile(imagePath, '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>');
  const asset = await appendAsset(projectId, {
    id: 'asset_missing_seed2',
    projectId,
    type: 'image',
    mediaType: 'image',
    source: 'upload',
    title: 'Missing env image',
    fileUrl: `/uploads/test/${projectId}/image.svg`,
    mimeType: 'image/svg+xml',
    tags: ['商品'],
  });
  await assert.rejects(() => analyzeAsset(projectId, asset.id, { provider: 'seed2' }), /ARK_API_KEY and SEED_ENDPOINT_ID/);
  const { getAsset } = require('../src/services/asset.service');
  const failed = await getAsset(projectId, asset.id);
  assert.equal(failed.analysisStatus, 'failed');
  assert.equal(failed.analysisError.code, 'MISSING_SEED2_ENV');
  await cleanupProject(projectId);
}));

test('video mock analyze extracts metadata, creates slices, supports search/recall, and deletes cascade', async (t) => {
  if (!(await hasBinary('ffmpeg')) || !(await hasBinary('ffprobe'))) {
    t.skip('FFmpeg/ffprobe not available');
    return;
  }
  const projectId = `test-video-${Date.now()}`;
  await cleanupProject(projectId);
  const videoPath = path.join(UPLOADS_DIR, 'test', projectId, 'video.mp4');
  await createTestVideo(videoPath, 5);
  const asset = await appendAsset(projectId, {
    id: 'asset_video_owner1',
    projectId,
    type: 'video',
    mediaType: 'video',
    source: 'upload',
    title: 'Hero Product Demo',
    fileUrl: `/uploads/test/${projectId}/video.mp4`,
    mimeType: 'video/mp4',
    tags: ['商品', '使用'],
  });
  const analyzed = await analyzeAsset(projectId, asset.id, { provider: 'mock' });
  assert.equal(analyzed.analysisStatus, 'completed');
  assert.ok(analyzed.metadata.video.duration >= 4.9);
  assert.equal(analyzed.metadata.video.width, 320);
  assert.equal(analyzed.metadata.video.height, 480);
  assert.ok(analyzed.slices.length >= 2);
  analyzed.slices.forEach((slice) => {
    assert.ok(slice.endTime > slice.startTime);
    assert.ok(slice.duration > 0);
    assert.ok(slice.thumbnailUrl);
  });
  const search = await searchProjectAssets(projectId, { keyword: 'Hero', tags: ['product'] });
  assert.ok(search.items.length >= 1);
  assert.ok(Array.isArray(search.items[0].matchedSlices));
  const recall = await recallAssets(projectId, { keywords: ['Hero'], requiredTags: ['usage'], topK: 1 });
  assert.ok(recall.items.length >= 1);
  assert.ok(recall.items[0].usageSuggestion);
  await assert.rejects(() => searchProjectAssets(projectId, { embeddingQuery: [0.1, 0.2] }), /Embedding search/);
  const removed = await deleteAsset(projectId, asset.id);
  assert.equal(removed.id, asset.id);
  const remainingSlices = await listSlices(projectId, asset.id);
  assert.equal(remainingSlices.total, 0);
  await cleanupProject(projectId);
});

test('representative frame sampling extracts 3 to 8 frames and cleanup removes frame directory', async (t) => {
  if (!(await hasBinary('ffmpeg'))) {
    t.skip('FFmpeg not available');
    return;
  }
  const projectId = `test-frames-${Date.now()}`;
  const assetId = 'asset_frame_sampling';
  await cleanupProject(projectId);
  const videoPath = path.join(UPLOADS_DIR, 'test', projectId, 'video.mp4');
  await createTestVideo(videoPath, 6);
  await appendAsset(projectId, {
    id: assetId,
    projectId,
    type: 'video',
    mediaType: 'video',
    source: 'upload',
    title: 'Frame sampling video',
    fileUrl: `/uploads/test/${projectId}/video.mp4`,
    mimeType: 'video/mp4',
  });
  const result = await sampleRepresentativeFrames({
    projectId,
    assetId,
    videoPath,
    duration: 6,
    slices: [
      { id: 'slice_1', startTime: 0, endTime: 3 },
      { id: 'slice_2', startTime: 3, endTime: 6 },
    ],
  });
  assert.ok(result.frames.length >= 2);
  assert.ok(result.frames.length <= 8);
  for (const frame of result.frames) {
    assert.ok(Number.isFinite(frame.timestamp));
    assert.ok(frame.filePath);
    assert.ok(frame.fileUrl);
    await fs.access(frame.filePath);
  }
  await deleteAsset(projectId, assetId);
  await assert.rejects(() => fs.access(frameDir(projectId, assetId)));
  await cleanupProject(projectId);
});
