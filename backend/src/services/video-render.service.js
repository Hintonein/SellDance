const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { OUTPUTS_DIR, UPLOADS_DIR } = require('../config/paths');

const RENDER_WIDTH = 1080;
const RENDER_HEIGHT = 1920;
const FRAME_RATE = 30;

function escapeForFilter(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function buildVideoFilter(subtitleText) {
  const base = [
    `scale=${RENDER_WIDTH}:${RENDER_HEIGHT}:force_original_aspect_ratio=decrease`,
    `pad=${RENDER_WIDTH}:${RENDER_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`,
    `fps=${FRAME_RATE}`,
    'format=yuv420p',
  ];

  if (!subtitleText) {
    return base.join(',');
  }

  const subtitle = escapeForFilter(subtitleText);
  return [
    ...base,
    `drawtext=text='${subtitle}':fontcolor=white:fontsize=46:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h-(text_h*2.2)`,
  ].join(',');
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) return resolve();
      return reject(new Error(`${command} exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

async function ensureFfmpegAvailable() {
  await runCommand('ffmpeg', ['-version']);
}

function resolveAssetPath(asset) {
  if (!asset?.filename) return null;
  return path.join(UPLOADS_DIR, asset.filename);
}

function isVideoAsset(asset) {
  if (!asset) return false;
  if ((asset.mimeType || '').startsWith('video/')) return true;
  return asset.type === 'video';
}

function isImageAsset(asset) {
  if (!asset) return false;
  if ((asset.mimeType || '').startsWith('image/')) return true;
  return asset.type === 'image';
}

async function createSceneClip({ scene, asset, clipPath }) {
  const duration = Number(scene.durationSeconds) || 3;
  const subtitleText = scene.subtitleText || scene.scriptText || '';
  const vf = buildVideoFilter(subtitleText);
  const assetPath = resolveAssetPath(asset);

  if (assetPath && isImageAsset(asset)) {
    await runCommand('ffmpeg', [
      '-y',
      '-loop',
      '1',
      '-i',
      assetPath,
      '-t',
      String(duration),
      '-vf',
      vf,
      '-r',
      String(FRAME_RATE),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-an',
      clipPath,
    ]);
    return;
  }

  if (assetPath && isVideoAsset(asset)) {
    await runCommand('ffmpeg', [
      '-y',
      '-stream_loop',
      '-1',
      '-i',
      assetPath,
      '-t',
      String(duration),
      '-vf',
      vf,
      '-r',
      String(FRAME_RATE),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-an',
      clipPath,
    ]);
    return;
  }

  await runCommand('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=black:s=${RENDER_WIDTH}x${RENDER_HEIGHT}:d=${duration}`,
    '-vf',
    vf,
    '-r',
    String(FRAME_RATE),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-an',
    clipPath,
  ]);
}

async function applyBackgroundMusic({ inputPath, outputPath, musicAssetPath }) {
  if (!musicAssetPath) {
    await fs.copyFile(inputPath, outputPath);
    return;
  }

  await runCommand('ffmpeg', [
    '-y',
    '-i',
    inputPath,
    '-stream_loop',
    '-1',
    '-i',
    musicAssetPath,
    '-filter_complex',
    '[1:a]volume=0.18[aud]',
    '-map',
    '0:v:0',
    '-map',
    '[aud]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-shortest',
    outputPath,
  ]);
}

function pickSceneAsset(scene, materialById) {
  const ids = Array.isArray(scene.selectedAssetIds) ? scene.selectedAssetIds : [];
  for (const id of ids) {
    const asset = materialById.get(id);
    if (asset) return asset;
  }
  return null;
}

function pickBackgroundMusicAsset(options, materialById) {
  const assetId = options?.backgroundMusicAssetId;
  if (!assetId) return null;
  const asset = materialById.get(assetId);
  if (!asset) return null;
  return resolveAssetPath(asset);
}

async function renderProjectVideo({ projectId, taskId, scenes, materials = [], options = {}, onProgress }) {
  if (!projectId || !taskId) {
    throw new Error('projectId and taskId are required for rendering.');
  }
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('No storyboard scenes available for rendering.');
  }

  await ensureFfmpegAvailable();

  const materialById = new Map(materials.map((asset) => [asset.id, asset]));
  const outputDir = path.join(OUTPUTS_DIR, projectId);
  const workDir = path.join(outputDir, `.work-${taskId}`);
  const mergedPath = path.join(workDir, 'merged.mp4');
  const finalPath = path.join(outputDir, `${taskId}.mp4`);

  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  const clipPaths = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const clipPath = path.join(workDir, `scene-${String(index + 1).padStart(3, '0')}.mp4`);
    clipPaths.push(clipPath);
    await createSceneClip({
      scene,
      asset: pickSceneAsset(scene, materialById),
      clipPath,
    });
    if (onProgress) {
      const clipProgress = Math.round(((index + 1) / scenes.length) * 70);
      await onProgress(Math.max(10, Math.min(clipProgress, 80)));
    }
  }

  const concatListPath = path.join(workDir, 'concat.txt');
  const concatList = clipPaths.map((clipPath) => `file '${clipPath.replace(/'/g, "'\\''")}'`).join('\n');
  await fs.writeFile(concatListPath, concatList, 'utf8');

  await runCommand('ffmpeg', [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    concatListPath,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(FRAME_RATE),
    '-an',
    mergedPath,
  ]);
  if (onProgress) await onProgress(90);

  const musicAssetPath = pickBackgroundMusicAsset(options, materialById);
  await applyBackgroundMusic({
    inputPath: mergedPath,
    outputPath: finalPath,
    musicAssetPath,
  });
  if (onProgress) await onProgress(100);

  await fs.rm(workDir, { recursive: true, force: true });

  return {
    exportFile: path.posix.join('outputs', projectId, `${taskId}.mp4`),
    videoUrl: `/outputs/${projectId}/${taskId}.mp4`,
  };
}

module.exports = {
  renderProjectVideo,
};
