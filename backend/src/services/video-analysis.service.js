const { v4: uuidv4 } = require('uuid');
const { generateJsonWithSeed2 } = require('../providers/volcengine/seed2.client');
const { listVideoAnalysisReports, writeVideoAnalysisReports } = require('./storage.service');
const { getVideo, updateVideo, SOURCE_DECLARATION, REUSE_DECLARATION } = require('./inspiration-video.service');

const REPORT_SCHEMA = {
  hook: 'opening hook summary inferred from public title/description/cover metadata',
  sellingPoints: ['observed public selling point'],
  narrativeStructure: ['hook', 'proof', 'scene', 'cta'],
  storyboard: [{ order: 1, role: 'hook', visual: 'abstract visual description, not copied', duration: 3 }],
  visualStyle: ['lighting, palette, composition inferred from metadata'],
  bgmStyle: 'BGM mood and rhythm, no music download or reuse',
  voiceoverStyle: 'voiceover style',
  subtitleStyle: 'subtitle style',
  cameraMovement: ['push in', 'handheld follow'],
  reusableTakeaways: ['abstract method only'],
  complianceRisks: ['risk or limitation'],
  complianceNotes: ['do not copy original expression'],
};
const activeAnalysisJobs = new Set();

function now() {
  return new Date().toISOString();
}

function arrayFrom(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeReport(projectId, video, raw = {}) {
  return {
    id: raw.id || `video_report_${uuidv4()}`,
    projectId,
    videoId: video.id,
    provider: raw.provider || 'seed2',
    model: raw.model || '',
    hook: raw.hook || '',
    sellingPoints: arrayFrom(raw.sellingPoints),
    narrativeStructure: arrayFrom(raw.narrativeStructure),
    storyboard: arrayFrom(raw.storyboard),
    visualStyle: arrayFrom(raw.visualStyle),
    bgmStyle: raw.bgmStyle || raw.bgm || '',
    voiceoverStyle: raw.voiceoverStyle || '',
    subtitleStyle: raw.subtitleStyle || '',
    cameraMovement: arrayFrom(raw.cameraMovement),
    reusableTakeaways: arrayFrom(raw.reusableTakeaways),
    complianceRisks: arrayFrom(raw.complianceRisks),
    complianceNotes: arrayFrom(raw.complianceNotes),
    sourceDeclaration: SOURCE_DECLARATION,
    reuseDeclaration: REUSE_DECLARATION,
    rawText: raw.rawText || '',
    parseWarning: raw.parseWarning || null,
    createdAt: raw.createdAt || now(),
  };
}

async function analyzeVideo(projectId, videoId, payload = {}) {
  const video = await getVideo(projectId, videoId);
  if (!video) return null;
  await updateVideo(projectId, videoId, { analysisStatus: 'processing', analysisError: null });
  const startedAt = Date.now();
  try {
    const raw = await generateJsonWithSeed2({
      systemPrompt: [
        'You analyze public short-form e-commerce video metadata for inspiration mining.',
        'Use only public metadata: title, description, source keyword, category, platform, source URL, cover URL and engagement metrics.',
        'Do not request, download, save, reproduce, remix, or imitate the original video.',
        'Extract abstract creative strategy and compliance risks only. Keep the answer concise.',
      ].join('\n'),
      userPrompt: JSON.stringify({
        video: {
          platform: video.platform,
          platformVideoId: video.platformVideoId,
          title: video.title,
          description: video.description,
          keyword: video.keyword,
          semanticFilter: video.semanticFilter || payload.semanticFilter || '',
          relevanceScore: video.relevanceScore,
          relevanceReason: video.relevanceReason,
          category: video.category,
          metrics: video.metrics,
          sourceUrl: video.sourceUrl,
          coverUrl: video.coverUrl,
        },
        sourceDeclaration: SOURCE_DECLARATION,
        reuseDeclaration: REUSE_DECLARATION,
      }),
      schema: REPORT_SCHEMA,
      fetchImpl: payload.fetchImpl,
    });
    const report = normalizeReport(projectId, video, raw);
    const reports = await listVideoAnalysisReports(projectId);
    await writeVideoAnalysisReports(projectId, [report, ...reports.filter((item) => item.id !== report.id)]);
    await updateVideo(projectId, videoId, {
      analysisStatus: 'completed',
      analysisReportId: report.id,
      analysisError: null,
      analysisDurationMs: Date.now() - startedAt,
    });
    return report;
  } catch (error) {
    await updateVideo(projectId, videoId, {
      analysisStatus: 'failed',
      analysisError: {
        message: error.message,
        code: error.code || 'VIDEO_ANALYSIS_FAILED',
        durationMs: Date.now() - startedAt,
      },
    });
    throw error;
  }
}

async function startAnalyzeVideo(projectId, videoId, payload = {}) {
  const video = await getVideo(projectId, videoId);
  if (!video) return null;
  const key = `${projectId}:${videoId}`;
  if (activeAnalysisJobs.has(key)) {
    return updateVideo(projectId, videoId, { analysisStatus: 'processing' });
  }
  activeAnalysisJobs.add(key);
  await updateVideo(projectId, videoId, { analysisStatus: 'processing', analysisError: null });
  analyzeVideo(projectId, videoId, payload)
    .catch((error) => {
      console.error('[inspiration.analysis.error]', {
        projectId,
        videoId,
        code: error.code,
        message: error.message,
      });
    })
    .finally(() => activeAnalysisJobs.delete(key));
  return getVideo(projectId, videoId);
}

async function listReports(projectId, filters = {}) {
  const rows = await listVideoAnalysisReports(projectId);
  return rows.filter((report) => !filters.videoId || report.videoId === filters.videoId);
}

async function getReport(projectId, reportId) {
  return (await listVideoAnalysisReports(projectId)).find((report) => report.id === reportId) || null;
}

module.exports = {
  REPORT_SCHEMA,
  analyzeVideo,
  startAnalyzeVideo,
  listReports,
  getReport,
  normalizeReport,
};
