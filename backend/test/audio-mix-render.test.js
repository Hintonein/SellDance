const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { UPLOADS_DIR, OUTPUTS_DIR } = require('../src/config/paths');
const { normalizeAsset } = require('../src/services/asset.service');
const { renderProjectVideo } = require('../src/services/video-render.service');

const execFileAsync = promisify(execFile);

async function hasBinary(name) {
  try {
    await execFileAsync(name, ['-version']);
    return true;
  } catch {
    return false;
  }
}

async function probeAudio(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
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
}

test('render mixes pure BGM under source audio and replaces source for voiceover track', async (t) => {
  if (!(await hasBinary('ffmpeg')) || !(await hasBinary('ffprobe'))) {
    t.skip('FFmpeg/ffprobe not available');
    return;
  }

  const projectId = `test-audio-mix-${Date.now()}`;
  const uploadDir = path.join(UPLOADS_DIR, 'test', projectId);
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.rm(path.join(OUTPUTS_DIR, projectId), { recursive: true, force: true });
  const sourcePath = path.join(uploadDir, 'source.mp4');
  const bgmPath = path.join(uploadDir, 'bgm.wav');
  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'testsrc=size=160x240:rate=30',
    '-f', 'lavfi',
    '-i', 'sine=frequency=440:duration=1',
    '-t', '1',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-pix_fmt', 'yuv420p',
    sourcePath,
  ]);
  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=880:duration=1',
    '-c:a', 'pcm_s16le',
    bgmPath,
  ]);

  const source = normalizeAsset(projectId, {
    id: 'source_video',
    type: 'video',
    mediaType: 'video',
    mimeType: 'video/mp4',
    fileUrl: `/uploads/test/${projectId}/source.mp4`,
  });
  const pureBgm = normalizeAsset(projectId, {
    id: 'bgm_audio',
    type: 'audio',
    mediaType: 'audio',
    mimeType: 'audio/wav',
    fileUrl: `/uploads/test/${projectId}/bgm.wav`,
    metadata: { audio: { kind: 'background_music', mixMode: 'mix_under_source', recommendedVolume: 0.12 } },
  });
  const voiceoverTrack = normalizeAsset(projectId, {
    id: 'voiceover_audio',
    type: 'audio',
    mediaType: 'audio',
    mimeType: 'audio/wav',
    fileUrl: `/uploads/test/${projectId}/bgm.wav`,
    metadata: { audio: { kind: 'full_audio_voiceover', mixMode: 'replace_source', recommendedVolume: 1 } },
  });
  const scenes = [{ sceneId: 'scene_1', duration: 1, selectedAssetIds: ['source_video'] }];

  const mixed = await renderProjectVideo({
    projectId,
    taskId: 'task_mix',
    scenes,
    materials: [source, pureBgm],
    options: { backgroundMusicAssetId: 'bgm_audio', audioMode: 'preserve_source' },
  });
  assert.equal(mixed.backgroundMusicMixMode, 'mix_under_source');
  assert.equal(mixed.sourceAudioPreserved, true);
  assert.equal(mixed.hasAudioTrack, true);
  assert.match(mixed.audioMixSummary, /BGM mixed/);
  assert.equal(await probeAudio(path.join(OUTPUTS_DIR, projectId, 'task_mix.mp4')), true);

  const replaced = await renderProjectVideo({
    projectId,
    taskId: 'task_replace',
    scenes,
    materials: [source, voiceoverTrack],
    options: { backgroundMusicAssetId: 'voiceover_audio' },
  });
  assert.equal(replaced.backgroundMusicMixMode, 'replace_source');
  assert.equal(replaced.sourceAudioPreserved, false);
  assert.match(replaced.audioMixSummary, /replaced source/);
  assert.equal(await probeAudio(path.join(OUTPUTS_DIR, projectId, 'task_replace.mp4')), true);

  await fs.rm(uploadDir, { recursive: true, force: true });
  await fs.rm(path.join(OUTPUTS_DIR, projectId), { recursive: true, force: true });
});
