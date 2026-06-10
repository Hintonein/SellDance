const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { v4: uuidv4 } = require('uuid');
const { TMP_INSPIRATION_ANALYSIS_DIR } = require('../config/paths');
const {
  listInspirationWorkflowTasks,
  writeInspirationWorkflowTasks,
} = require('./storage.service');
const { getVideo, updateVideo, SOURCE_DECLARATION, REUSE_DECLARATION } = require('./inspiration-video.service');
const { analyzeVideo, normalizeReport } = require('./video-analysis.service');
const { listVideoAnalysisReports, writeVideoAnalysisReports } = require('./storage.service');
const { generateTemplate } = require('./inspiration-template.service');
const { analyzeVideoFramesWithSeed2 } = require('../providers/volcengine/seed2.client');
const { probeVideoMetadata } = require('./video-metadata.service');

const execFileAsync = promisify(execFile);
const active = new Set();
const DEFAULT_ANALYSIS_CONCURRENCY = 5;

function now() { return new Date().toISOString(); }

async function saveTask(projectId, task) {
  const rows = await listInspirationWorkflowTasks(projectId);
  const exists = rows.some((item) => item.id === task.id);
  await writeInspirationWorkflowTasks(projectId, exists ? rows.map((item) => (item.id === task.id ? task : item)) : [task, ...rows]);
}

function log(task, message, level = 'info') {
  task.logs = [...(task.logs || []), { timestamp: now(), level, message: String(message || '').slice(0, 1600) }].slice(-300);
}

async function listTasks(projectId) {
  return (await listInspirationWorkflowTasks(projectId)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function getTask(projectId, taskId) {
  return (await listInspirationWorkflowTasks(projectId)).find((task) => task.id === taskId) || null;
}

function frameTimestamps(duration) {
  const value = Number(duration || 0);
  if (!Number.isFinite(value) || value <= 0) return [0.5, 2, 5];
  return [...new Set([
    0.5,
    Math.min(2, Math.max(0.2, value - 0.2)),
    Math.max(0.2, value * 0.35),
    Math.max(0.2, value * 0.65),
    Math.max(0.2, value - 0.5),
  ].map((item) => Number(Math.min(item, Math.max(0.2, value - 0.2)).toFixed(2))))].slice(0, 5);
}

async function downloadTempVideo(video, dir) {
  if (!video.temporaryDownloadUrl) {
    const error = new Error('No temporary public video download URL is available for deep analysis. Run a fresh search first.');
    error.code = 'PUBLIC_VIDEO_DOWNLOAD_URL_MISSING';
    throw error;
  }
  await fs.mkdir(dir, { recursive: true });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.PUBLIC_VIDEO_DOWNLOAD_TIMEOUT_MS || 30000));
  try {
    const response = await fetch(video.temporaryDownloadUrl, { signal: controller.signal });
    if (!response.ok) {
      const error = new Error(`Public video temporary download failed with HTTP ${response.status}.`);
      error.code = 'PUBLIC_VIDEO_DOWNLOAD_FAILED';
      throw error;
    }
    const maxBytes = Number(process.env.PUBLIC_VIDEO_MAX_BYTES || 80 * 1024 * 1024);
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength && contentLength > maxBytes) {
      const error = new Error('Public video is too large for temporary deep analysis.');
      error.code = 'PUBLIC_VIDEO_TOO_LARGE';
      throw error;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      const error = new Error('Public video is too large for temporary deep analysis.');
      error.code = 'PUBLIC_VIDEO_TOO_LARGE';
      throw error;
    }
    const filePath = path.join(dir, 'source.mp4');
    await fs.writeFile(filePath, buffer);
    return filePath;
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeout = new Error('Public video temporary download timed out.');
      timeout.code = 'PUBLIC_VIDEO_DOWNLOAD_TIMEOUT';
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function extractFrames(videoPath, dir, duration) {
  const framesDir = path.join(dir, 'frames');
  await fs.mkdir(framesDir, { recursive: true });
  const frames = [];
  for (const [index, timestamp] of frameTimestamps(duration).entries()) {
    const filePath = path.join(framesDir, `frame-${index}.jpg`);
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss', String(timestamp),
      '-i', videoPath,
      '-frames:v', '1',
      '-q:v', '3',
      filePath,
    ], { maxBuffer: 1024 * 1024 * 5 });
    frames.push({ filePath, timestamp, source: 'temporary_public_video_frame' });
  }
  return frames;
}

function reportFromSeed2Frames(projectId, video, raw = {}, frames = [], metadata = {}) {
  const sliceSuggestions = Array.isArray(raw.sliceSuggestions) ? raw.sliceSuggestions : [];
  return normalizeReport(projectId, video, {
    provider: raw.provider,
    model: raw.model,
    hook: raw.hook || raw.summary || raw.video?.overallSummary || `Opening hook and selling-point breakdown for ${video.title || 'Public video'}`,
    sellingPoints: raw.sellingPoints || raw.product?.sellingPoints || [],
    narrativeStructure: raw.narrativeStructure || ['hook', 'visual proof', 'usage scene', 'cta'],
    storyboard: sliceSuggestions.length
      ? sliceSuggestions.map((item, index) => ({
          order: index + 1,
          role: item.usageSuggestion || item.tags?.[0] || 'reference_factor',
          visual: item.visualDescription,
          duration: Number(item.endTime || 0) - Number(item.startTime || 0) || 2,
        }))
      : frames.map((frame, index) => ({
          order: index + 1,
          role: index === 0 ? 'hook' : 'visual_factor',
          visual: `Abstract visual breakdown from temporary frame at ${frame.timestamp}s`,
          duration: 2,
        })),
    visualStyle: Array.isArray(raw.visualStyle) ? raw.visualStyle : [raw.visual?.style].filter(Boolean),
    bgmStyle: raw.bgmStyle || 'Analyze rhythm and mood only. Do not download or reuse the original BGM.',
    voiceoverStyle: raw.voiceoverStyle || '',
    subtitleStyle: raw.subtitleStyle || '',
    cameraMovement: raw.video?.cameraStyle ? [raw.video.cameraStyle] : [],
    reusableTakeaways: raw.tags || raw.suggestedUseCases || [],
    complianceRisks: ['Only abstract strategy may be reused. Do not recreate the source video visuals, music, subtitles, shot order, or distinctive expression.'],
    complianceNotes: [SOURCE_DECLARATION, REUSE_DECLARATION],
    rawText: raw.rawText,
    videoMetadata: metadata,
  });
}

async function deepAnalyzeVideo(projectId, videoId, task) {
  const video = await getVideo(projectId, videoId);
  if (!video) throw new Error(`Video ${videoId} not found.`);
  const dir = path.join(TMP_INSPIRATION_ANALYSIS_DIR, task.id, videoId);
  await updateVideo(projectId, videoId, { analysisStatus: 'processing', analysisError: null });
  try {
    log(task, `Temporarily downloading public video for analysis: ${video.title || videoId}`);
    const videoPath = await downloadTempVideo(video, dir);
    const metadata = await probeVideoMetadata(videoPath).catch(() => ({ duration: 0 }));
    log(task, `Extracting a small set of representative frames from ${video.title || videoId}`);
    const frames = await extractFrames(videoPath, dir, metadata.duration);
    const raw = await analyzeVideoFramesWithSeed2({
      asset: {
        id: video.id,
        mediaType: 'video',
        title: video.title,
        type: 'public_reference_video',
        metadata: {
          publicReference: true,
          title: video.title,
          description: video.description,
          metrics: video.metrics,
          sourceUrl: video.sourceUrl,
          sourceDeclaration: SOURCE_DECLARATION,
          reuseDeclaration: REUSE_DECLARATION,
          video: metadata,
        },
      },
      frames,
      promptContext: {
        purpose: 'temporary public video deep analysis for abstract inspiration only',
        title: video.title,
        description: video.description,
        semanticFilter: video.semanticFilter,
        compliance: [SOURCE_DECLARATION, REUSE_DECLARATION],
      },
    });
    const report = reportFromSeed2Frames(projectId, video, raw, frames, metadata);
    const reports = await listVideoAnalysisReports(projectId);
    await writeVideoAnalysisReports(projectId, [report, ...reports.filter((item) => item.id !== report.id)]);
    await updateVideo(projectId, videoId, {
      analysisStatus: 'completed',
      analysisReportId: report.id,
      analysisError: null,
      temporaryDownloadUrl: '',
      deepAnalysisCompletedAt: now(),
    });
    return report;
  } catch (error) {
    await updateVideo(projectId, videoId, {
      analysisStatus: 'failed',
      analysisError: { message: error.message, code: error.code || 'DEEP_PUBLIC_VIDEO_ANALYSIS_FAILED' },
      temporaryDownloadUrl: '',
    });
    throw error;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function startAnalyzeAndTemplate(projectId, payload = {}) {
  const task = {
    id: `insp_workflow_${uuidv4()}`,
    projectId,
    type: payload.deep ? 'deep_analyze_and_template' : 'analyze_and_template',
    status: 'queued',
    stage: 'queued',
    progress: 0,
    total: (payload.videoIds || []).length,
    completed: 0,
    failed: 0,
    videoIds: payload.videoIds || [],
    templateId: null,
    error: null,
    logs: [],
    createdAt: now(),
    updatedAt: now(),
  };
  await saveTask(projectId, task);
  runAnalyzeAndTemplate(projectId, task, payload).catch(async (error) => {
    task.status = 'failed';
    task.error = { message: error.message, code: error.code };
    task.updatedAt = now();
    log(task, error.message, 'error');
    await saveTask(projectId, task);
  });
  return task;
}

async function runAnalyzeAndTemplate(projectId, task, payload = {}) {
  if (active.has(task.id)) return;
  active.add(task.id);
  try {
    task.status = 'running';
    task.stage = payload.deep ? 'deep_analysis' : 'metadata_analysis';
    task.progress = 5;
    task.updatedAt = now();
    log(task, `Starting analysis for ${task.total} public videos`);
    await saveTask(projectId, task);
    const completedVideoIds = [];
    const failedVideoIds = [];
    const pending = [...task.videoIds];
    const running = new Set();
    const concurrency = Math.max(1, Math.min(
      Number(payload.concurrency || process.env.INSPIRATION_ANALYSIS_CONCURRENCY || DEFAULT_ANALYSIS_CONCURRENCY),
      DEFAULT_ANALYSIS_CONCURRENCY,
      pending.length || 1
    ));
    log(task, `Concurrent analysis started: processing up to ${concurrency} videos at a time`);

    async function runOne(videoId, index) {
      running.add(videoId);
      task.currentVideoIds = Array.from(running);
      task.currentVideoId = videoId;
      task.currentIndex = index + 1;
      task.progress = Math.round(((task.completed + task.failed) / Math.max(1, task.total)) * 70) + 5;
      task.updatedAt = now();
      await saveTask(projectId, task);
      try {
        if (payload.deep) await deepAnalyzeVideo(projectId, videoId, task);
        else await analyzeVideo(projectId, videoId, payload);
        completedVideoIds.push(videoId);
        task.completed += 1;
      } catch (error) {
        task.failed += 1;
        failedVideoIds.push(videoId);
        log(task, `Analysis failed for ${videoId}: ${error.message}`, 'error');
      } finally {
        running.delete(videoId);
        task.currentVideoIds = Array.from(running);
        task.currentVideoId = task.currentVideoIds[0] || '';
        task.progress = Math.round(((task.completed + task.failed) / Math.max(1, task.total)) * 70) + 5;
        task.updatedAt = now();
        await saveTask(projectId, task);
      }
    }

    let cursor = 0;
    async function worker() {
      while (cursor < pending.length) {
        const index = cursor;
        cursor += 1;
        await runOne(pending[index], index);
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    if (!completedVideoIds.length) {
      const error = new Error('No videos were analyzed successfully; template generation skipped.');
      error.code = 'NO_ANALYZED_VIDEOS';
      throw error;
    }
    task.stage = 'template_generation';
    task.progress = 82;
    task.failedVideoIds = failedVideoIds;
    task.currentVideoIds = [];
    task.currentVideoId = '';
    log(task, `Completed analysis for ${completedVideoIds.length} videos. Generating methodology template`);
    await saveTask(projectId, task);
    const template = await generateTemplate(projectId, {
      videoIds: completedVideoIds,
      name: payload.name || 'Public video inspiration methodology',
      category: payload.category || 'general',
    });
    task.templateId = template.id;
    task.status = 'completed';
    task.stage = 'completed';
    task.progress = 100;
    task.updatedAt = now();
    log(task, `Methodology template generated: ${template.name}`, 'success');
    await saveTask(projectId, task);
  } finally {
    active.delete(task.id);
  }
}

async function cleanupStaleTemporaryDirs(maxAgeMs = 60 * 60 * 1000) {
  let entries = [];
  try { entries = await fs.readdir(TMP_INSPIRATION_ANALYSIS_DIR, { withFileTypes: true }); } catch { return; }
  const cutoff = Date.now() - maxAgeMs;
  await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const dir = path.join(TMP_INSPIRATION_ANALYSIS_DIR, entry.name);
    const stat = await fs.stat(dir).catch(() => null);
    if (stat && stat.mtimeMs < cutoff) await fs.rm(dir, { recursive: true, force: true });
  }));
}

module.exports = {
  listTasks,
  getTask,
  startAnalyzeAndTemplate,
  deepAnalyzeVideo,
  frameTimestamps,
  cleanupStaleTemporaryDirs,
};
