const test = require('node:test');
const assert = require('node:assert/strict');
const { clipsToRenderScenes } = require('../src/services/video-render.service');
const { buildSmartEditingPlan } = require('../src/services/creation-agent.service');

test('creation render scenes do not burn captions by default or sidecar mode', () => {
  const clips = [{ id: 'clip_1', duration: 3, subtitle: 'caption draft text', voiceover: 'voiceover draft', caption: 'caption draft' }];

  const clean = clipsToRenderScenes(clips);
  assert.equal(clean[0].subtitleText, '');
  assert.equal(clean[0].scriptText, '');

  const sidecar = clipsToRenderScenes(clips, { subtitleMode: 'sidecar' });
  assert.equal(sidecar[0].subtitleText, '');
  assert.equal(sidecar[0].scriptText, '');

  const burned = clipsToRenderScenes(clips, { subtitleMode: 'burned_in_experimental' });
  assert.equal(burned[0].subtitleText, 'caption draft text');
  assert.equal(burned[0].scriptText, 'voiceover draft');
});

test('smart editing fallback keeps TTS disabled and stores captions as drafts', async () => {
  const plan = await buildSmartEditingPlan(`test-creation-agent-${Date.now()}`, {
    scenes: [
      {
        id: 'scene_1',
        duration: 3,
        generatedVideoUrl: '/outputs/test/storyboard/scene_1.mp4',
        subtitle: 'caption draft only',
        sceneRole: 'hook',
      },
    ],
  }, {
    generateJsonWithSeed2: async () => {
      throw new Error('Seed2 unavailable in test');
    },
  });

  assert.equal(plan.mode, 'smart_editing');
  assert.equal(plan.renderSettings.subtitleMode, 'off');
  assert.equal(plan.renderSettings.audioMode, 'preserve_source');
  assert.equal(plan.renderSettings.ttsEnabled, false);
  assert.equal(plan.audio.ttsAvailable, false);
  assert.equal(plan.clips[0].subtitle, '');
  assert.equal(plan.clips[0].caption, 'caption draft only');
  assert.equal(plan.clips[0].sourceUrl, '/outputs/test/storyboard/scene_1.mp4');
});

test('smart editing plan preserves sidecar subtitles and uploaded bgm render settings', async () => {
  const plan = await buildSmartEditingPlan(`test-creation-agent-audio-${Date.now()}`, {
    subtitleMode: 'sidecar',
    audioMode: 'uploaded_bgm',
    backgroundMusicAssetId: 'asset_bgm_1',
    scenes: [
      {
        id: 'scene_1',
        duration: 3,
        generatedVideoUrl: '/outputs/test/storyboard/scene_1.mp4',
        subtitle: 'sidecar caption',
        sceneRole: 'hook',
      },
    ],
  }, {
    generateJsonWithSeed2: async () => ({
      clips: [
        {
          sceneId: 'scene_1',
          duration: 3,
          captionDraft: 'seed2 caption draft',
          reason: 'matches hook',
        },
      ],
      captionDrafts: [{ clipIndex: 1, text: 'seed2 sidecar caption' }],
    }),
  });

  assert.equal(plan.renderSettings.subtitleMode, 'sidecar');
  assert.equal(plan.renderSettings.audioMode, 'uploaded_bgm');
  assert.equal(plan.renderSettings.ttsEnabled, false);
  assert.equal(plan.captionDrafts[0].text, 'seed2 sidecar caption');
});
