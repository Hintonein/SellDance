const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { UPLOADS_DIR } = require('../config/paths');

const execFileAsync = promisify(execFile);

function parseRate(value) {
  if (!value || value === '0/0') return null;
  const [numerator, denominator] = String(value).split('/').map(Number);
  if (!Number.isFinite(numerator)) return null;
  if (!Number.isFinite(denominator) || denominator === 0) return numerator;
  const fps = numerator / denominator;
  return Number.isFinite(fps) ? Number(fps.toFixed(3)) : null;
}

function videoToolError(tool, error) {
  const wrapped = new Error(tool + ' failed or is unavailable. Install FFmpeg/ffprobe and retry. Detail: ' + error.message);
  wrapped.statusCode = 400;
  wrapped.code = String(tool).toUpperCase() + '_FAILED';
  return wrapped;
}

function safePreviewName(assetId) {
  const safeId = String(assetId || 'asset').replace(/[^a-zA-Z0-9_-]/g, '');
  return 'browser-preview-' + safeId + '.mp4';
}

function isBrowserPlayableVideo({ mimeType = '', fileUrl = '', metadata = {} } = {}) {
  const lowerMime = String(mimeType || '').toLowerCase();
  const lowerUrl = String(fileUrl || '').toLowerCase();
  const codec = String(metadata.codec || '').toLowerCase();
  const looksLikeMp4 = lowerMime === 'video/mp4' || lowerUrl.endsWith('.mp4');
  return looksLikeMp4 && ['h264', 'avc1'].includes(codec);
}

async function createBrowserVideoPreview({ filePath, assetId, mimeType = '', fileUrl = '', metadata = {} }) {
  if (isBrowserPlayableVideo({ mimeType, fileUrl, metadata })) {
    return {
      previewUrl: fileUrl,
      previewStatus: 'source_browser_playable',
      previewMimeType: mimeType || 'video/mp4',
    };
  }
  const filename = safePreviewName(assetId);
  const outputPath = path.join(UPLOADS_DIR, filename);
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', filePath,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-dn',
      '-sn',
      '-vf', 'scale=-2:720,format=yuv420p',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-threads', '2',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-shortest',
      outputPath,
    ], { maxBuffer: 1024 * 1024 * 8 });
    return {
      previewUrl: '/uploads/' + filename,
      previewStatus: 'generated',
      previewMimeType: 'video/mp4',
    };
  } catch (error) {
    try { await fs.unlink(outputPath); } catch { /* no-op */ }
    return {
      previewUrl: '',
      previewStatus: 'failed',
      previewError: error.message,
      previewMimeType: 'video/mp4',
    };
  }
}

async function probeVideoMetadata(filePath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ], { maxBuffer: 1024 * 1024 * 5 });
    const parsed = JSON.parse(stdout || '{}');
    const videoStream = (parsed.streams || []).find((stream) => stream.codec_type === 'video') || {};
    const format = parsed.format || {};
    const duration = Number(format.duration || videoStream.duration || 0);
    return {
      duration: Number.isFinite(duration) && duration > 0 ? Number(duration.toFixed(3)) : 0,
      width: Number(videoStream.width || 0),
      height: Number(videoStream.height || 0),
      fps: parseRate(videoStream.avg_frame_rate) || parseRate(videoStream.r_frame_rate),
      codec: videoStream.codec_name || '',
      format: format.format_name || '',
      bitrate: format.bit_rate ? Number(format.bit_rate) : null,
      frameCount: videoStream.nb_frames ? Number(videoStream.nb_frames) : null,
      provider: 'ffprobe',
    };
  } catch (error) {
    throw videoToolError('ffprobe', error);
  }
}

function safeThumbnailName(assetId, index) {
  const safeId = String(assetId || 'asset').replace(/[^a-zA-Z0-9_-]/g, '');
  return 'slice-thumb-' + safeId + '-' + index + '.jpg';
}

async function generateSliceThumbnail({ filePath, assetId, index, startTime }) {
  const filename = safeThumbnailName(assetId, index);
  const outputPath = path.join(UPLOADS_DIR, filename);
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss', String(Math.max(0, Number(startTime || 0))),
      '-i', filePath,
      '-frames:v', '1',
      '-q:v', '3',
      outputPath,
    ], { maxBuffer: 1024 * 1024 * 5 });
    return '/uploads/' + filename;
  } catch {
    return null;
  }
}

function buildFixedWindowRanges(duration, windowSeconds = 3) {
  const normalizedDuration = Number(duration || 0);
  if (!Number.isFinite(normalizedDuration) || normalizedDuration <= 0) return [];
  const sliceDuration = Math.max(1, Number(windowSeconds || 3));
  const ranges = [];
  for (let start = 0, index = 0; start < normalizedDuration && index < 40; start += sliceDuration, index += 1) {
    const end = Math.min(normalizedDuration, start + sliceDuration);
    if (end <= start) break;
    ranges.push({ index, startTime: Number(start.toFixed(3)), endTime: Number(end.toFixed(3)), duration: Number((end - start).toFixed(3)) });
  }
  return ranges;
}

async function createVideoSlicesFromAsset(asset, filePath, options = {}) {
  const metadata = asset.metadata?.video || asset.analysis?.videoMetadata || {};
  const duration = Number(metadata.duration || asset.duration || 0);
  const ranges = buildFixedWindowRanges(duration, options.windowSeconds || 3);
  const baseTags = ['video', 'slice', ...(asset.systemTags || []), ...(asset.userTags || asset.tags || [])];
  const slices = [];
  for (const range of ranges) {
    const thumbnailUrl = await generateSliceThumbnail({ filePath, assetId: asset.id, index: range.index, startTime: range.startTime });
    slices.push({
      ...range,
      thumbnailUrl: thumbnailUrl || asset.thumbnailUrl || asset.fileUrl || asset.url || null,
      transcript: null,
      visualDescription: 'Video slice ' + (range.index + 1) + ' from ' + (asset.title || asset.name || 'asset') + ' (' + range.startTime + 's-' + range.endTime + 's).',
      userTags: [],
      systemTags: [...baseTags, 'slice_' + (range.index + 1)],
      tags: [...baseTags, 'slice_' + (range.index + 1)],
      embedding: null,
      metadata: {
        generatedBy: 'phase2_fixed_window',
        sourceAssetTitle: asset.title || asset.name || '',
        videoMetadata: metadata,
      },
      analysisStatus: 'completed',
    });
  }
  return slices;
}

module.exports = {
  probeVideoMetadata,
  createBrowserVideoPreview,
  isBrowserPlayableVideo,
  generateSliceThumbnail,
  buildFixedWindowRanges,
  createVideoSlicesFromAsset,
};
