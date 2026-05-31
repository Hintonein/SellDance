const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { OUTPUTS_DIR, UPLOADS_DIR } = require('../config/paths');
const { ensureSafeId } = require('./id-validator.service');

const RENDER_WIDTH = 1080;
const RENDER_HEIGHT = 1920;
const FRAME_RATE = 30;
const CLIP_PROGRESS_MAX = 70;
const CLIP_PROGRESS_LOWER_BOUND = 10;
const CLIP_PROGRESS_UPPER_BOUND = 80;
const CONCAT_PROGRESS = 90;
const COMPLETE_PROGRESS = 100;

function resolveSafePath(baseDir, ...segments) {
  const root = path.resolve(baseDir);
  const target = path.resolve(root, ...segments);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error('Unsafe file path.');
  }
  return target;
}

function escapeForFilter(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/\r?\n/g, '\\n')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function buildLayoutFilters(layout) {
  if (layout === 'cover') {
    return [
      `scale='if(gt(a,${RENDER_WIDTH}/${RENDER_HEIGHT}),-1,${RENDER_WIDTH})':'if(gt(a,${RENDER_WIDTH}/${RENDER_HEIGHT}),${RENDER_HEIGHT},-1)'`,
      `crop=${RENDER_WIDTH}:${RENDER_HEIGHT}`,
    ];
  }

  return [
    `scale=${RENDER_WIDTH}:${RENDER_HEIGHT}:force_original_aspect_ratio=decrease`,
    `pad=${RENDER_WIDTH}:${RENDER_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`,
  ];
}

function buildVideoFilter(scene, duration, includeSubtitle = true) {
  const subtitleText = scene.subtitleText || scene.scriptText || '';
  const base = [...buildLayoutFilters(scene.layout), `fps=${FRAME_RATE}`, 'format=yuv420p'];
  const withTransition = [...base];
  if (scene.transition === 'fade' && duration > 0) {
    const fadeDuration = Math.min(0.35, duration / 2);
    withTransition.push(`fade=t=in:st=0:d=${fadeDuration}`);
    if (duration > fadeDuration * 2) {
      withTransition.push(`fade=t=out:st=${duration - fadeDuration}:d=${fadeDuration}`);
    }
  }

  if (!includeSubtitle || !subtitleText) {
    return withTransition.join(',');
  }

  const subtitle = escapeForFilter(subtitleText);
  withTransition.push(
    `drawtext=text='${subtitle}':fontcolor=white:fontsize=46:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h-(text_h*2.2)`,
  );
  return withTransition.join(',');
}

async function runWithSubtitleFallback(buildArgs) {
  try {
    await runCommand('ffmpeg', buildArgs(true));
  } catch (error) {
    if (!String(error.message || '').includes('No such filter:')) throw error;
    await runCommand('ffmpeg', buildArgs(false));
  }
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
  if (asset?.filename) {
    const safeFileName = path.basename(asset.filename);
    if (safeFileName && safeFileName === asset.filename) return resolveSafePath(UPLOADS_DIR, safeFileName);
  }
  const fileUrl = asset?.fileUrl || asset?.url || asset?.sourceUrl;
  if (typeof fileUrl === 'string' && fileUrl.startsWith('/uploads/')) {
    const relative = fileUrl.replace(/^\/uploads\//, '');
    if (relative && !relative.includes('..') && !path.isAbsolute(relative)) return resolveSafePath(UPLOADS_DIR, relative);
  }
  return null;
}

function isVideoAsset(asset) {
  if (!asset) return false;
  if ((asset.mimeType || '').startsWith('video/')) return true;
  if (asset.mediaType === 'video') return true;
  return asset.type === 'video';
}

function isImageAsset(asset) {
  if (!asset) return false;
  if ((asset.mimeType || '').startsWith('image/')) return true;
  if (asset.mediaType === 'image') return true;
  return asset.type === 'image';
}

async function createSceneClip({ scene, asset, clipPath }) {
  const duration = Number(scene.durationSeconds || scene.duration) || 3;
  const assetPath = resolveAssetPath(asset);

  if (assetPath && isImageAsset(asset)) {
    await runWithSubtitleFallback((includeSubtitle) => [
      '-y',
      '-loop',
      '1',
      '-i',
      assetPath,
      '-t',
      String(duration),
      '-vf',
      buildVideoFilter(scene, duration, includeSubtitle),
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
    await runWithSubtitleFallback((includeSubtitle) => {
      const args = [
      '-y',
      ];
      const startTime = Number(scene.startTime || 0);
      if (Number.isFinite(startTime) && startTime > 0) args.push('-ss', String(startTime));
      args.push(
        '-stream_loop',
        '-1',
        '-i',
        assetPath,
        '-t',
        String(duration),
        '-vf',
        buildVideoFilter(scene, duration, includeSubtitle),
        '-r',
        String(FRAME_RATE),
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-an',
        clipPath,
      );
      return args;
    });
    return;
  }

  await runWithSubtitleFallback((includeSubtitle) => [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=black:s=${RENDER_WIDTH}x${RENDER_HEIGHT}:d=${duration}`,
    '-vf',
    buildVideoFilter(scene, duration, includeSubtitle),
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

function pickSceneAsset(scene, materialById) {
  const ids = Array.isArray(scene.selectedAssetIds) ? scene.selectedAssetIds : [];
  for (const id of ids) {
    const asset = materialById.get(id);
    if (asset) return asset;
  }
  return null;
}

function clipsToRenderScenes(clips = []) {
  return clips.map((clip, index) => ({
    sceneId: clip.sceneId || clip.id,
    sceneOrder: index + 1,
    sceneIndex: index + 1,
    durationSeconds: Number(clip.duration || 3),
    duration: Number(clip.duration || 3),
    startTime: clip.startTime,
    endTime: clip.endTime,
    subtitleText: clip.subtitle || clip.voiceover || '',
    subtitle: clip.subtitle || clip.voiceover || '',
    scriptText: clip.voiceover || clip.subtitle || '',
    visualDescription: clip.subtitle || clip.role || '',
    cameraMotion: 'editing-plan cut',
    selectedAssetIds: clip.assetId ? [clip.assetId] : [],
    selectedAssetSliceIds: clip.sliceId ? [clip.sliceId] : [],
    layout: clip.fitMode === 'contain' ? 'contain' : 'cover',
    transition: clip.transitionIn === 'fade' ? 'fade' : 'cut',
  }));
}

function pickBackgroundMusicAsset(options, materialById) {
  const assetId = options?.backgroundMusicAssetId;
  if (!assetId) return null;
  const asset = materialById.get(assetId);
  if (!asset) return null;
  return resolveAssetPath(asset);
}

function escapeConcatFilePath(filePath) {
  return filePath.replace(/'/g, "'\\''");
}

async function renderProjectVideo({ projectId, taskId, scenes, materials = [], options = {}, onProgress }) {
  if (!projectId || !taskId) {
    throw new Error('projectId and taskId are required for rendering.');
  }
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('No storyboard scenes available for rendering.');
  }

  await ensureFfmpegAvailable();

  const safeProjectId = ensureSafeId(projectId);
  const safeTaskId = ensureSafeId(taskId);
  const materialById = new Map(materials.map((asset) => [asset.id, asset]));
  const outputDir = resolveSafePath(OUTPUTS_DIR, safeProjectId);
  const workDir = resolveSafePath(outputDir, `.work-${safeTaskId}`);
  const mergedPath = resolveSafePath(workDir, 'merged.mp4');
  const finalPath = resolveSafePath(outputDir, `${safeTaskId}.mp4`);

  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  try {
    const clipPaths = [];
    for (let index = 0; index < scenes.length; index += 1) {
      const scene = scenes[index];
      const clipPath = resolveSafePath(workDir, `scene-${String(index + 1).padStart(3, '0')}.mp4`);
      clipPaths.push(clipPath);
      await createSceneClip({
        scene,
        asset: pickSceneAsset(scene, materialById),
        clipPath,
      });
      if (onProgress) {
        const clipProgress = Math.round(((index + 1) / scenes.length) * CLIP_PROGRESS_MAX);
        await onProgress(Math.max(CLIP_PROGRESS_LOWER_BOUND, Math.min(clipProgress, CLIP_PROGRESS_UPPER_BOUND)));
      }
    }

    const concatListPath = resolveSafePath(workDir, 'concat.txt');
    const concatList = clipPaths.map((clipPath) => `file '${escapeConcatFilePath(clipPath)}'`).join('\n');
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
    if (onProgress) await onProgress(CONCAT_PROGRESS);

    const musicAssetPath = pickBackgroundMusicAsset(options, materialById);
    if (!musicAssetPath) {
      await fs.copyFile(mergedPath, finalPath);
    } else {
      await runCommand('ffmpeg', [
        '-y',
        '-i',
        mergedPath,
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
        finalPath,
      ]);
    }
    if (onProgress) await onProgress(COMPLETE_PROGRESS);

    return {
      exportFile: path.posix.join('outputs', safeProjectId, `${safeTaskId}.mp4`),
      videoUrl: `/${path.posix.join('outputs', safeProjectId, `${safeTaskId}.mp4`)}`,
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

module.exports = {
  renderProjectVideo,
  clipsToRenderScenes,
};
