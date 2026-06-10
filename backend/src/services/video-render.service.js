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

function normalizeSubtitleMode(value) {
  if (value === 'sidecar' || value === 'burned_in_experimental') return value;
  return 'off';
}

function normalizeBackgroundMusicMixMode(value, asset = null) {
  const assetMixMode = asset?.metadata?.audio?.mixMode;
  if (value === 'replace_source' || value === 'mix_under_source') return value;
  if (assetMixMode === 'replace_source' || assetMixMode === 'mix_under_source') return assetMixMode;
  return asset ? 'mix_under_source' : null;
}

function normalizeBackgroundMusicVolume(value, asset = null, mixMode = 'mix_under_source') {
  const parsed = Number(value ?? asset?.metadata?.audio?.recommendedVolume);
  if (Number.isFinite(parsed) && parsed > 0) return Math.max(0.01, Math.min(1, Number(parsed.toFixed(2))));
  return mixMode === 'replace_source' ? 1 : 0.16;
}

function normalizeAudioMode(value, hasBackgroundMusic = false, backgroundMusicMixMode = null) {
  if (value === 'silent') return 'silent';
  if (value === 'uploaded_bgm') return 'uploaded_bgm';
  if (hasBackgroundMusic && backgroundMusicMixMode === 'replace_source') return 'uploaded_bgm';
  return 'preserve_source';
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

function runCommandCapture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) return resolve(stdout);
      return reject(new Error(`${command} exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

async function probeHasAudio(filePath) {
  if (!filePath) return false;
  try {
    const stdout = await runCommandCapture('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=codec_type',
      '-of',
      'csv=p=0',
      filePath,
    ]);
    return stdout.trim().includes('audio');
  } catch {
    return false;
  }
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
  if (typeof fileUrl === 'string' && fileUrl.startsWith('/outputs/')) {
    const relative = fileUrl.replace(/^\/outputs\//, '');
    if (relative && !relative.includes('..') && !path.isAbsolute(relative)) return resolveSafePath(OUTPUTS_DIR, relative);
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

async function createSceneClip({ scene, asset, clipPath, includeSubtitles = false, includeAudioTrack = true, preserveSourceAudio = true }) {
  const duration = Number(scene.durationSeconds || scene.duration) || 3;
  const assetPath = resolveAssetPath(asset);
  const audioArgs = includeAudioTrack
    ? [
      '-f',
      'lavfi',
      '-t',
      String(duration),
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=44100',
    ]
    : [];

  if (assetPath && isImageAsset(asset)) {
    await runWithSubtitleFallback((includeSubtitle) => [
      '-y',
      '-loop',
      '1',
      '-i',
      assetPath,
      ...audioArgs,
      '-t',
      String(duration),
      '-vf',
      buildVideoFilter(scene, duration, includeSubtitles && includeSubtitle),
      '-r',
      String(FRAME_RATE),
      ...(includeAudioTrack ? ['-map', '0:v:0', '-map', '1:a:0'] : []),
      '-c:v',
      'libx264',
      ...(includeAudioTrack ? ['-c:a', 'aac', '-shortest'] : ['-an']),
      '-pix_fmt',
      'yuv420p',
      clipPath,
    ]);
    return;
  }

  if (assetPath && isVideoAsset(asset)) {
    const hasSourceAudio = preserveSourceAudio && await probeHasAudio(assetPath);
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
        ...(includeAudioTrack && !hasSourceAudio ? audioArgs : []),
        '-t',
        String(duration),
        '-vf',
        buildVideoFilter(scene, duration, includeSubtitles && includeSubtitle),
        '-r',
        String(FRAME_RATE),
        '-map',
        '0:v:0',
        ...(includeAudioTrack ? ['-map', hasSourceAudio ? '0:a:0' : '1:a:0'] : []),
        '-c:v',
        'libx264',
        ...(includeAudioTrack ? ['-c:a', 'aac', '-shortest'] : ['-an']),
        '-pix_fmt',
        'yuv420p',
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
    ...audioArgs,
    '-vf',
    buildVideoFilter(scene, duration, includeSubtitles && includeSubtitle),
    '-r',
    String(FRAME_RATE),
    ...(includeAudioTrack ? ['-map', '0:v:0', '-map', '1:a:0'] : []),
    '-c:v',
    'libx264',
    ...(includeAudioTrack ? ['-c:a', 'aac', '-shortest'] : ['-an']),
    '-pix_fmt',
    'yuv420p',
    clipPath,
  ]);
}

function pickSceneAsset(scene, materialById) {
  if (scene.sourceUrl) {
    return {
      id: scene.sceneId || scene.id || 'storyboard_generated_output',
      fileUrl: scene.sourceUrl,
      mediaType: scene.mediaType || 'video',
      type: scene.mediaType || 'video',
      mimeType: scene.mediaType === 'image' ? 'image/png' : 'video/mp4',
    };
  }
  const ids = Array.isArray(scene.selectedAssetIds) ? scene.selectedAssetIds : [];
  for (const id of ids) {
    const asset = materialById.get(id);
    if (asset) return asset;
  }
  return null;
}

function clipsToRenderScenes(clips = [], options = {}) {
  const includeSubtitleText = normalizeSubtitleMode(options.subtitleMode || options.renderSettings?.subtitleMode) === 'burned_in_experimental';
  return clips.map((clip, index) => ({
    sceneId: clip.sceneId || clip.id,
    sceneOrder: index + 1,
    sceneIndex: index + 1,
    durationSeconds: Number(clip.duration || 3),
    duration: Number(clip.duration || 3),
    startTime: clip.startTime,
    endTime: clip.endTime,
    subtitleText: includeSubtitleText ? (clip.subtitle || clip.caption || clip.voiceover || '') : '',
    subtitle: includeSubtitleText ? (clip.subtitle || clip.caption || clip.voiceover || '') : '',
    caption: clip.caption || clip.subtitle || clip.voiceover || '',
    subtitleDraft: clip.caption || clip.subtitle || '',
    scriptText: includeSubtitleText ? (clip.voiceover || clip.subtitle || clip.caption || '') : '',
    visualDescription: clip.visualDescription || clip.reason || clip.role || '',
    cameraMotion: 'editing-plan cut',
    selectedAssetIds: clip.assetId ? [clip.assetId] : [],
    selectedAssetSliceIds: clip.sliceId ? [clip.sliceId] : [],
    sourceUrl: clip.sourceUrl || '',
    mediaType: clip.mediaType || '',
    layout: clip.fitMode === 'contain' ? 'contain' : 'cover',
    transition: clip.transitionIn === 'fade' ? 'fade' : 'cut',
  }));
}

function srtTime(seconds) {
  const totalMs = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const sec = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const min = totalMinutes % 60;
  const hour = Math.floor(totalMinutes / 60);
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

async function writeSidecarSubtitles(outputDir, safeTaskId, scenes = [], captionDrafts = []) {
  const rows = [];
  let cursor = 0;
  scenes.forEach((scene, index) => {
    const duration = Number(scene.durationSeconds || scene.duration || 0);
    const text = scene.caption || scene.subtitleDraft || captionDrafts[index]?.text || '';
    if (text) {
      rows.push(`${rows.length + 1}\n${srtTime(cursor)} --> ${srtTime(cursor + duration)}\n${text}\n`);
    }
    cursor += duration;
  });
  if (!rows.length) return null;
  const fileName = `${safeTaskId}.srt`;
  await fs.writeFile(resolveSafePath(outputDir, fileName), rows.join('\n'), 'utf8');
  return `/${path.posix.join('outputs', path.basename(outputDir), fileName)}`;
}

function pickBackgroundMusicAsset(options, materialById) {
  const assetId = options?.backgroundMusicAssetId;
  if (!assetId) return null;
  const asset = materialById.get(assetId);
  if (!asset) return null;
  const filePath = resolveAssetPath(asset);
  return filePath ? { asset, filePath } : null;
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
  const materialById = new Map();
  materials.forEach((asset) => {
    [asset?.id, asset?.assetId, asset?.materialId].filter(Boolean).forEach((id) => materialById.set(id, asset));
  });
  const outputDir = resolveSafePath(OUTPUTS_DIR, safeProjectId);
  const workDir = resolveSafePath(outputDir, `.work-${safeTaskId}`);
  const mergedPath = resolveSafePath(workDir, 'merged.mp4');
  const finalPath = resolveSafePath(outputDir, `${safeTaskId}.mp4`);

  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  const subtitleMode = normalizeSubtitleMode(options.subtitleMode || options.renderSettings?.subtitleMode);
  const includeSubtitles = subtitleMode === 'burned_in_experimental';
  const musicAsset = pickBackgroundMusicAsset(options, materialById);
  const backgroundMusicMixMode = normalizeBackgroundMusicMixMode(
    options.backgroundMusicMixMode || options.renderSettings?.backgroundMusicMixMode,
    musicAsset?.asset || null
  );
  const backgroundMusicVolume = normalizeBackgroundMusicVolume(
    options.backgroundMusicVolume || options.renderSettings?.backgroundMusicVolume,
    musicAsset?.asset || null,
    backgroundMusicMixMode || 'mix_under_source'
  );
  const musicAssetPath = musicAsset?.filePath || null;
  const audioMode = normalizeAudioMode(options.audioMode || options.renderSettings?.audioMode, Boolean(musicAssetPath), backgroundMusicMixMode);
  const includeAudioTrack = audioMode !== 'silent';
  const preserveSourceAudio = audioMode === 'preserve_source';

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
        includeSubtitles,
        includeAudioTrack,
        preserveSourceAudio,
      });
      if (onProgress) {
        const clipProgress = Math.round(((index + 1) / scenes.length) * CLIP_PROGRESS_MAX);
        await onProgress(Math.max(CLIP_PROGRESS_LOWER_BOUND, Math.min(clipProgress, CLIP_PROGRESS_UPPER_BOUND)));
      }
    }

    const concatListPath = resolveSafePath(workDir, 'concat.txt');
    const concatList = clipPaths.map((clipPath) => `file '${escapeConcatFilePath(clipPath)}'`).join('\n');
    await fs.writeFile(concatListPath, concatList, 'utf8');

    const concatArgs = [
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
      ...(includeAudioTrack ? ['-c:a', 'aac'] : ['-an']),
      mergedPath,
    ];
    await runCommand('ffmpeg', concatArgs);
    if (onProgress) await onProgress(CONCAT_PROGRESS);

    if (audioMode === 'silent' || !musicAssetPath) {
      await fs.copyFile(mergedPath, finalPath);
    } else if (backgroundMusicMixMode === 'mix_under_source') {
      await runCommand('ffmpeg', [
        '-y',
        '-i',
        mergedPath,
        '-stream_loop',
        '-1',
        '-i',
        musicAssetPath,
        '-filter_complex',
        `[1:a]volume=${backgroundMusicVolume}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[aud]`,
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
        `[1:a]volume=${backgroundMusicVolume}[aud]`,
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
    const captionUrl = subtitleMode === 'sidecar'
      ? await writeSidecarSubtitles(outputDir, safeTaskId, scenes, options.captionDrafts || options.editingPlan?.captionDrafts || [])
      : null;

    return {
      exportFile: path.posix.join('outputs', safeProjectId, `${safeTaskId}.mp4`),
      videoUrl: `/${path.posix.join('outputs', safeProjectId, `${safeTaskId}.mp4`)}`,
      captionUrl,
      subtitleMode,
      audioMode,
      backgroundMusicMixMode: musicAssetPath ? backgroundMusicMixMode : null,
      backgroundMusicVolume: musicAssetPath ? backgroundMusicVolume : null,
      backgroundMusicAssetId: options.backgroundMusicAssetId || null,
      sourceAudioPreserved: audioMode === 'preserve_source',
      audioMixSummary: musicAssetPath
        ? (backgroundMusicMixMode === 'mix_under_source' ? 'Source audio preserved + BGM mixed quietly.' : 'BGM replaced source audio.')
        : (audioMode === 'silent' ? 'Audio disabled.' : 'Source audio preserved.'),
      hasAudioTrack: audioMode !== 'silent' && (includeAudioTrack || Boolean(musicAssetPath)),
      audioFallbackReason: includeAudioTrack ? null : 'Audio was explicitly disabled.',
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

module.exports = {
  renderProjectVideo,
  clipsToRenderScenes,
};
