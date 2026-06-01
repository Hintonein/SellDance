const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { UPLOADS_DIR } = require('../config/paths');

const execFileAsync = promisify(execFile);

function now() { return new Date().toISOString(); }

function frameDir(projectId, assetId) {
  const safeProjectId = String(projectId || 'project').replace(/[^a-zA-Z0-9_-]/g, '');
  const safeAssetId = String(assetId || 'asset').replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(UPLOADS_DIR, 'derived', 'frames', safeProjectId, safeAssetId);
}

function frameUrl(projectId, assetId, filename) {
  const safeProjectId = String(projectId || 'project').replace(/[^a-zA-Z0-9_-]/g, '');
  const safeAssetId = String(assetId || 'asset').replace(/[^a-zA-Z0-9_-]/g, '');
  return `/uploads/derived/frames/${safeProjectId}/${safeAssetId}/${filename}`;
}

function timestampsFromSlices(slices = []) {
  return slices
    .filter((slice) => Number.isFinite(Number(slice.startTime)) && Number.isFinite(Number(slice.endTime)) && Number(slice.endTime) > Number(slice.startTime))
    .slice(0, 8)
    .map((slice, index) => ({
      index,
      timestamp: Number(((Number(slice.startTime) + Number(slice.endTime)) / 2).toFixed(3)),
      sliceId: slice.id,
      source: 'slice_midpoint',
    }));
}

function timestampsFromDuration(duration) {
  const value = Number(duration || 0);
  if (!Number.isFinite(value) || value <= 0) return [];
  const count = value <= 8 ? 3 : Math.min(8, Math.max(3, Math.ceil(value / 3)));
  if (count === 1) return [{ index: 0, timestamp: Number((value / 2).toFixed(3)), source: 'duration_sampling' }];
  return Array.from({ length: count }, (_, index) => {
    const ratio = index / (count - 1);
    const timestamp = Math.min(Math.max(value * ratio, 0.1), Math.max(0.1, value - 0.1));
    return { index, timestamp: Number(timestamp.toFixed(3)), source: 'duration_sampling' };
  });
}

async function extractFrame({ videoPath, outputPath, timestamp }) {
  await execFileAsync('ffmpeg', [
    '-y',
    '-ss', String(Math.max(0, Number(timestamp || 0))),
    '-i', videoPath,
    '-frames:v', '1',
    '-q:v', '3',
    outputPath,
  ], { maxBuffer: 1024 * 1024 * 5 });
}

async function sampleRepresentativeFrames({ projectId, assetId, videoPath, duration, slices = [] }) {
  const planned = timestampsFromSlices(slices);
  const timestamps = planned.length ? planned : timestampsFromDuration(duration);
  if (!timestamps.length) {
    const error = new Error('Cannot sample representative frames without video duration or slices.');
    error.statusCode = 400;
    error.code = 'FRAME_SAMPLING_NO_TIMESTAMPS';
    throw error;
  }
  const dir = frameDir(projectId, assetId);
  await fs.mkdir(dir, { recursive: true });
  const frames = [];
  const failures = [];
  for (const item of timestamps.slice(0, 8)) {
    const filename = `frame-${String(item.index).padStart(3, '0')}.jpg`;
    const filePath = path.join(dir, filename);
    try {
      await extractFrame({ videoPath, outputPath: filePath, timestamp: item.timestamp });
      frames.push({
        timestamp: item.timestamp,
        filePath,
        fileUrl: frameUrl(projectId, assetId, filename),
        assetId,
        projectId,
        source: item.source,
        sliceId: item.sliceId || null,
        createdAt: now(),
      });
    } catch (error) {
      failures.push({ timestamp: item.timestamp, message: error.message });
    }
  }
  if (!frames.length) {
    const error = new Error('Failed to sample representative frames with FFmpeg.');
    error.statusCode = 400;
    error.code = 'FRAME_SAMPLING_FAILED';
    error.details = failures;
    throw error;
  }
  return { frames, failures };
}

async function deleteSampledFramesByAsset(projectId, assetId) {
  try {
    await fs.rm(frameDir(projectId, assetId), { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

module.exports = {
  sampleRepresentativeFrames,
  deleteSampledFramesByAsset,
  timestampsFromSlices,
  timestampsFromDuration,
  frameDir,
};
