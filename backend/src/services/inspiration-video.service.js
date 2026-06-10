const { v4: uuidv4 } = require('uuid');
const {
  listInspirationVideos: readVideos,
  writeInspirationVideos,
  listVideoAnalysisReports,
  writeVideoAnalysisReports,
} = require('./storage.service');
const { generateJsonWithSeed2 } = require('../providers/volcengine/seed2.client');

const SOURCE_DECLARATION = 'Only public metadata, source links, source declarations, and structured analysis are saved. Public videos are not retained, copied, remixed, or reused as assets.';
const REUSE_DECLARATION = 'Generated content may only reuse abstract strategy and creative factors. It must not copy source-video wording, shots, music, subtitles, sequencing, or unique expressions.';

function now() {
  return new Date().toISOString();
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function publishedAtFromSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function normalizeCrawlerItem(projectId, payload = {}) {
  const platform = payload.platform || payload.sourcePlatform || 'dy';
  const platformVideoId = String(payload.platformVideoId || payload.aweme_id || payload.note_id || payload.video_id || payload.id || '').trim();
  const sourceUrl = payload.sourceUrl || payload.aweme_url || payload.note_url || payload.url || '';
  return {
    id: payload.id || `insp_video_${uuidv4()}`,
    projectId,
    platform,
    platformVideoId,
    category: payload.category || 'general',
    keyword: payload.keyword || payload.source_keyword || '',
    searchRank: Number.isFinite(Number(payload.searchRank || payload.search_rank)) ? Number(payload.searchRank || payload.search_rank) : null,
    title: payload.title || payload.desc || 'Untitled public video',
    description: payload.description || payload.desc || payload.title || '',
    author: {
      id: String(payload.user_id || payload.author?.id || ''),
      nickname: payload.nickname || payload.author?.nickname || '',
      avatar: payload.avatar || payload.author?.avatar || '',
    },
    metrics: {
      likedCount: toNumber(payload.liked_count || payload.metrics?.likedCount),
      collectedCount: toNumber(payload.collected_count || payload.metrics?.collectedCount),
      commentCount: toNumber(payload.comment_count || payload.metrics?.commentCount),
      shareCount: toNumber(payload.share_count || payload.metrics?.shareCount),
    },
    publishedAt: payload.publishedAt || publishedAtFromSeconds(payload.create_time),
    sourceUrl,
    coverUrl: payload.cover_url || payload.coverUrl || '',
    temporaryDownloadUrl: payload.temporaryDownloadUrl || payload.video_download_url || '',
    sourceDeclaration: payload.sourceDeclaration || SOURCE_DECLARATION,
    reuseDeclaration: payload.reuseDeclaration || REUSE_DECLARATION,
    analysisStatus: payload.analysisStatus || 'pending',
    analysisReportId: payload.analysisReportId || null,
    semanticFilter: payload.semanticFilter || '',
    relevanceScore: Number.isFinite(Number(payload.relevanceScore)) ? Number(payload.relevanceScore) : null,
    relevanceReason: payload.relevanceReason || '',
    engagementScore: Number.isFinite(Number(payload.engagementScore)) ? Number(payload.engagementScore) : 0,
    combinedScore: Number.isFinite(Number(payload.combinedScore)) ? Number(payload.combinedScore) : 0,
    rankingModel: payload.rankingModel || '',
    rankingFallback: Boolean(payload.rankingFallback),
    createdAt: payload.createdAt || now(),
    updatedAt: now(),
  };
}

function passesFilters(video, filters = {}) {
  if (filters.platform && video.platform !== filters.platform) return false;
  if (filters.category && video.category !== filters.category) return false;
  const keyword = String(filters.keyword || '').trim().toLowerCase();
  if (keyword) {
    const haystack = [video.title, video.description, video.keyword, video.author?.nickname].join(' ').toLowerCase();
    if (!haystack.includes(keyword)) return false;
  }
  return true;
}

async function listVideos(projectId, filters = {}) {
  const rows = await readVideos(projectId);
  return rows.filter((video) => passesFilters(video, filters)).sort(compareRankedVideos);
}

async function getVideo(projectId, videoId) {
  return (await readVideos(projectId)).find((video) => video.id === videoId) || null;
}

async function upsertVideosFromCrawler(projectId, items = [], defaults = {}) {
  const rows = await readVideos(projectId);
  const byKey = new Map(rows.map((video) => [`${video.platform}:${video.platformVideoId || video.sourceUrl}`, video]));
  const saved = [];
  for (const raw of items) {
    const normalized = normalizeCrawlerItem(projectId, { ...raw, ...defaults, keyword: raw.source_keyword || defaults.keyword });
    const key = `${normalized.platform}:${normalized.platformVideoId || normalized.sourceUrl}`;
    if (!normalized.platformVideoId && !normalized.sourceUrl) continue;
    const existing = byKey.get(key);
    const next = existing
      ? { ...existing, ...normalized, id: existing.id, createdAt: existing.createdAt, analysisStatus: existing.analysisStatus || normalized.analysisStatus, analysisReportId: existing.analysisReportId || null, updatedAt: now() }
      : normalized;
    byKey.set(key, next);
    saved.push(next);
  }
  await writeInspirationVideos(projectId, Array.from(byKey.values()));
  return saved;
}

async function updateVideo(projectId, videoId, patch = {}) {
  const rows = await readVideos(projectId);
  let updated = null;
  const next = rows.map((video) => {
    if (video.id !== videoId) return video;
    updated = { ...video, ...patch, id: video.id, projectId, updatedAt: now() };
    return updated;
  });
  if (!updated) return null;
  await writeInspirationVideos(projectId, next);
  return updated;
}

function compareRankedVideos(a, b) {
  const scoreDiff = Number(b.combinedScore || 0) - Number(a.combinedScore || 0);
  if (Math.abs(scoreDiff) > 0.0001) return scoreDiff;
  const likeDiff = Number(b.metrics?.likedCount || 0) - Number(a.metrics?.likedCount || 0);
  if (likeDiff) return likeDiff;
  const collectDiff = Number(b.metrics?.collectedCount || 0) - Number(a.metrics?.collectedCount || 0);
  if (collectDiff) return collectDiff;
  const shareDiff = Number(b.metrics?.shareCount || 0) - Number(a.metrics?.shareCount || 0);
  if (shareDiff) return shareDiff;
  return String(b.createdAt).localeCompare(String(a.createdAt));
}

function engagementScores(videos = []) {
  const rawScores = videos.map((video) => Math.log10(Number(video.metrics?.likedCount || 0) + 1));
  const max = Math.max(...rawScores, 0);
  return rawScores.map((score) => (max > 0 ? Number((score / max).toFixed(4)) : 0));
}

function clampScore(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

async function scoreRelevanceWithSeed2(videos = [], semanticFilter = '', options = {}) {
  if (!semanticFilter.trim() || !videos.length) return new Map();
  const raw = await generateJsonWithSeed2({
    systemPrompt: [
      'You score public short-form video metadata for relevance to an e-commerce inspiration search.',
      'Use only title, description, source keyword, category, platform and engagement metadata.',
      'Return strict JSON with relevanceScore from 0 to 1 for each item.',
    ].join('\n'),
    userPrompt: JSON.stringify({
      semanticFilter,
      items: videos.slice(0, 30).map((video) => ({
        id: video.id,
        platformVideoId: video.platformVideoId,
        title: video.title,
        description: video.description,
        keyword: video.keyword,
        category: video.category,
        platform: video.platform,
        authorNickname: video.author?.nickname,
        metrics: video.metrics,
      })),
    }),
    schema: {
      items: [
        {
          id: 'insp_video id',
          platformVideoId: 'platform video id',
          relevanceScore: 0.86,
          reason: 'short relevance reason',
        },
      ],
    },
    fetchImpl: options.fetchImpl,
  });
  const map = new Map();
  for (const item of raw.items || []) {
    const key = item.id || item.platformVideoId;
    if (!key) continue;
    map.set(key, {
      relevanceScore: clampScore(item.relevanceScore),
      relevanceReason: String(item.reason || '').slice(0, 300),
      rankingModel: raw.model || 'seed2',
    });
  }
  return map;
}

async function rankVideos(projectId, videos = [], semanticFilter = '', options = {}) {
  const rows = await readVideos(projectId);
  const targetIds = new Set(videos.map((video) => video.id));
  const engagement = engagementScores(videos);
  let relevance = new Map();
  let fallback = false;
  if (semanticFilter.trim()) {
    try {
      relevance = await scoreRelevanceWithSeed2(videos, semanticFilter, options);
    } catch (error) {
      fallback = true;
    }
  }
  const rankedById = new Map(videos.map((video, index) => {
    const score = relevance.get(video.id) || relevance.get(video.platformVideoId);
    const relevanceScore = semanticFilter.trim() ? clampScore(score?.relevanceScore, fallback ? 0 : 0.5) : 1;
    const engagementScore = engagement[index] || 0;
    return [video.id, {
      ...video,
      semanticFilter,
      relevanceScore,
      relevanceReason: score?.relevanceReason || (fallback ? 'Seed2 relevance scoring failed; ranked by engagement.' : ''),
      engagementScore,
      combinedScore: Number(((relevanceScore * 0.7) + (engagementScore * 0.3)).toFixed(4)),
      rankingModel: score?.rankingModel || (semanticFilter.trim() ? 'seed2' : 'engagement'),
      rankingFallback: fallback,
      updatedAt: now(),
    }];
  }));
  const next = rows.map((video) => (targetIds.has(video.id) ? rankedById.get(video.id) : video));
  await writeInspirationVideos(projectId, next);
  return Array.from(rankedById.values()).sort(compareRankedVideos).slice(0, 10);
}

async function attachLatestReport(projectId, video) {
  if (!video?.analysisReportId) return video;
  const reports = await listVideoAnalysisReports(projectId);
  return { ...video, analysisReport: reports.find((report) => report.id === video.analysisReportId) || null };
}

async function clearVideos(projectId) {
  await writeInspirationVideos(projectId, []);
  await writeVideoAnalysisReports(projectId, []);
  return { success: true, cleared: true };
}

module.exports = {
  SOURCE_DECLARATION,
  REUSE_DECLARATION,
  normalizeCrawlerItem,
  listVideos,
  getVideo,
  upsertVideosFromCrawler,
  updateVideo,
  attachLatestReport,
  clearVideos,
  compareRankedVideos,
  rankVideos,
  scoreRelevanceWithSeed2,
};
