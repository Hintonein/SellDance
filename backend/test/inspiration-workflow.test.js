const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');

const { buildCrawlerArgs, parseLogLevel, waitForChromeReady, limitRowsBySearchRank } = require('../src/services/crawler.service');
const { normalizeCrawlerItem, SOURCE_DECLARATION, REUSE_DECLARATION, scoreRelevanceWithSeed2, rankVideos } = require('../src/services/inspiration-video.service');
const { normalizeReport } = require('../src/services/video-analysis.service');
const { normalizeTemplate } = require('../src/services/inspiration-template.service');
const { normalizeGeneratedScript } = require('../src/services/script-generation.service');
const { generateJsonWithSeed2, responsesUrl } = require('../src/providers/volcengine/seed2.client');
const { INSPIRATION_VIDEOS_DIR } = require('../src/config/paths');

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

test('crawler args pass platform, keywords, count, output path, and disable comments/media reuse path', () => {
  const args = buildCrawlerArgs({
    platform: 'dy',
    keywords: '六神花露水',
    limit: 12,
    outputDir: '/tmp/crawler-run',
  });
  assert.deepEqual(args.slice(0, 3), ['run', 'python', 'main.py']);
  assert.ok(args.includes('--platform'));
  assert.ok(args.includes('dy'));
  assert.ok(args.includes('--keywords'));
  assert.ok(args.includes('六神花露水'));
  assert.ok(args.includes('--crawler_max_notes_count'));
  assert.ok(args.includes('12'));
  assert.ok(args.includes('--save_data_path'));
  assert.ok(args.includes('/tmp/crawler-run'));
  assert.ok(args.includes('--get_comment'));
  assert.ok(args.includes('false'));
  assert.ok(args.includes('--get_sub_comment'));
  assert.equal(args[args.indexOf('--headless') + 1], 'false');
});

test('crawler log level parser keeps MediaCrawler INFO logs informational', () => {
  assert.equal(parseLogLevel('2026-06-10 MediaCrawler INFO Browser connection disconnected', 'error'), 'info');
  assert.equal(parseLogLevel('playwright._impl._errors.TargetClosedError: Target page, context or browser has been closed', 'info'), 'error');
  assert.equal(parseLogLevel('MediaCrawler timed out after 300000ms.', 'info'), 'error');
});

test('crawler import limits rows by douyin search_rank before ranking', () => {
  const rows = [
    { aweme_id: 'third', search_rank: 3 },
    { aweme_id: 'first', search_rank: 1 },
    { aweme_id: 'second', search_rank: 2 },
    { aweme_id: 'fourth', search_rank: 4 },
  ];
  assert.deepEqual(limitRowsBySearchRank(rows, 2).map((row) => row.aweme_id), ['first', 'second']);
});

test('chrome readiness waits for CDP endpoint before crawler starts', async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => ({ Browser: 'Chrome/Test' }),
    };
  };
  try {
    const task = { logs: [] };
    const ready = await waitForChromeReady(task, 1000);
    assert.equal(ready.Browser, 'Chrome/Test');
    assert.equal(calls, 1);
    assert.match(task.logs[0].message, /Chrome CDP ready/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('crawler metadata normalization drops download URLs and keeps source declaration', () => {
  const video = normalizeCrawlerItem('project_1', {
    platform: 'dy',
    category: 'personal_care',
    aweme_id: '123',
    title: 'Public title',
    desc: 'Public desc',
    aweme_url: 'https://www.douyin.com/video/123',
    cover_url: 'https://cover.example/1.jpg',
    video_download_url: 'https://download.example/video.mp4',
    music_download_url: 'https://download.example/music.mp3',
    liked_count: '8',
  });
  assert.equal(video.platformVideoId, '123');
  assert.equal(video.sourceUrl, 'https://www.douyin.com/video/123');
  assert.equal(video.metrics.likedCount, 8);
  assert.equal(video.sourceDeclaration, SOURCE_DECLARATION);
  assert.equal(video.reuseDeclaration, REUSE_DECLARATION);
  assert.equal(video.temporaryDownloadUrl, 'https://download.example/video.mp4');
  assert.equal(Object.prototype.hasOwnProperty.call(video, 'video_download_url'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(video, 'music_download_url'), false);
});

test('Seed2 text JSON call uses endpoint id and strict text content', withEnv({
  ARK_API_KEY: 'test-key',
  SEED_ENDPOINT_ID: 'ep-seed2-test',
  ARK_BASE_URL: 'https://ark.cn-beijing.volces.com',
}, async () => {
  let captured = null;
  const result = await generateJsonWithSeed2({
    systemPrompt: 'System prompt',
    userPrompt: '{"hello":"world"}',
    schema: { answer: 'string' },
    fetchImpl: async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ output_text: '{"answer":"ok"}' }),
      };
    },
  });
  assert.equal(captured.url, responsesUrl('https://ark.cn-beijing.volces.com'));
  assert.equal(captured.options.headers.Authorization, 'Bearer test-key');
  assert.equal(captured.body.model, 'ep-seed2-test');
  assert.equal(captured.body.input[0].content[0].type, 'input_text');
  assert.match(captured.body.input[0].content[0].text, /Return strict JSON only/);
  assert.equal(result.answer, 'ok');
  assert.equal(result.provider, 'seed2');
}));

test('semantic relevance scoring sends video titles to Seed2 and ranks with likes', withEnv({
  ARK_API_KEY: 'test-key',
  SEED_ENDPOINT_ID: 'ep-seed2-test',
  ARK_BASE_URL: 'https://ark.cn-beijing.volces.com',
}, async () => {
  let promptText = '';
  const videos = [
    normalizeCrawlerItem('project_rank', {
      platform: 'dy',
      aweme_id: 'low_like_relevant',
      title: '六神花露水夏日家用驱蚊场景',
      desc: '家庭夏日使用',
      liked_count: '10',
      aweme_url: 'https://source/1',
    }),
    normalizeCrawlerItem('project_rank', {
      platform: 'dy',
      aweme_id: 'high_like_less_relevant',
      title: '普通好物分享',
      desc: '泛生活内容',
      liked_count: '10000',
      aweme_url: 'https://source/2',
    }),
  ];
  const scores = await scoreRelevanceWithSeed2(videos, '家用花露水驱蚊场景', {
    fetchImpl: async (_url, options) => {
      promptText = JSON.parse(options.body).input[0].content[0].text;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          output_text: JSON.stringify({
            items: [
              { id: videos[0].id, platformVideoId: 'low_like_relevant', relevanceScore: 1, reason: 'exact product scene' },
              { id: videos[1].id, platformVideoId: 'high_like_less_relevant', relevanceScore: 0.1, reason: 'too broad' },
            ],
          }),
        }),
      };
    },
  });
  assert.match(promptText, /六神花露水夏日家用驱蚊场景/);
  assert.equal(scores.get(videos[0].id).relevanceScore, 1);

  const projectId = `project_rank_temp_${Date.now()}`;
  const ranked = await rankVideos(projectId, videos, '家用花露水驱蚊场景', {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        output_text: JSON.stringify({
          items: [
            { id: videos[0].id, relevanceScore: 1, reason: 'exact' },
            { id: videos[1].id, relevanceScore: 0.1, reason: 'broad' },
          ],
        }),
      }),
    }),
  });
  assert.equal(ranked[0].platformVideoId, 'low_like_relevant');
  assert.ok(ranked[0].combinedScore > ranked[1].combinedScore);
  await fs.rm(path.join(INSPIRATION_VIDEOS_DIR, `${projectId}.json`), { force: true });
}));

test('analysis report, inspiration template, and generated script require compliance fields', () => {
  const video = normalizeCrawlerItem('project_1', { platform: 'dy', aweme_id: '123', aweme_url: 'https://source' });
  const report = normalizeReport('project_1', video, {
    hook: 'fast hook',
    complianceRisks: ['claim risk'],
  });
  assert.equal(report.sourceDeclaration, SOURCE_DECLARATION);
  assert.equal(report.reuseDeclaration, REUSE_DECLARATION);
  assert.deepEqual(report.complianceRisks, ['claim risk']);

  const template = normalizeTemplate('project_1', {
    strategy: { name: 'First-person BGM immersion', description: 'Abstract strategy.' },
    factors: { opening: ['POV hook'] },
  }, [report]);
  assert.deepEqual(template.sourceVideoIds, [video.id]);
  assert.equal(template.sourceDeclaration, SOURCE_DECLARATION);
  assert.ok(template.complianceNotes.length);

  const script = normalizeGeneratedScript('project_1', {
    storyboardShots: [{ order: 1, duration: 3, sceneRole: 'hook', visualDescription: 'Original product opening.' }],
    complianceTips: ['avoid unverifiable claims'],
  }, template, { title: 'Product' });
  assert.equal(script.sourceDeclaration, SOURCE_DECLARATION);
  assert.equal(script.sourceTemplateDeclaration, REUSE_DECLARATION);
  assert.equal(script.storyboardShots[0].sceneRole, 'hook');
  assert.deepEqual(script.complianceTips, ['avoid unverifiable claims']);
});
