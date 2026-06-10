const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveDialogueLanguage } = require('../src/services/language-policy.service');
const { normalizeScript } = require('../src/services/script.service');
const { buildScenePrompt } = require('../src/services/storyboard-video-generation.service');

test('dialogue language policy detects Chinese product context and keeps mock script Chinese', () => {
  const policy = resolveDialogueLanguage({
    productName: '六神花露水',
    sellingPoints: ['驱蚊', '清凉', '夏天家用'],
    targetAudience: '家庭用户',
  });
  assert.equal(policy.dialogueLanguage, 'zh-CN');
  assert.match(policy.languageInstruction, /Simplified Chinese/);

  const script = normalizeScript('project_language_zh', {
    productInfo: '六神花露水',
    sellingPoints: ['驱蚊', '清凉'],
    targetAudience: '家庭用户',
  });
  assert.equal(script.dialogueLanguage, 'zh-CN');
  assert.equal(script.productInfo.dialogueLanguage, 'zh-CN');
  assert.match(script.scenes[0].voiceover, /六神花露水|先别划走|帮你/);
  assert.doesNotMatch(script.scenes[0].voiceover, /Stop scrolling|Tap the product/i);
});

test('dialogue language policy keeps English context English and honors explicit override', () => {
  assert.equal(resolveDialogueLanguage({ productName: 'Travel tumbler', sellingPoints: ['leakproof lid'] }).dialogueLanguage, 'en');
  assert.equal(resolveDialogueLanguage({ productName: 'Travel tumbler' }, 'zh-CN').dialogueLanguage, 'zh-CN');
});

test('Seedance prompt carries target dialogue language and anti-mixing instruction', () => {
  const prompt = buildScenePrompt({
    id: 'scene_1',
    order: 1,
    sceneRole: 'hook',
    duration: 3,
    voiceover: '先别划走，六神花露水帮你解决夏天蚊虫问题。',
    subtitle: '夏天驱蚊更清爽',
    dialogueLanguage: 'zh-CN',
    seedancePrompt: 'Show the product bottle in a summer home scene.',
  }, 0, {});

  assert.match(prompt, /Target spoken dialogue language: zh-CN/);
  assert.match(prompt, /Spoken dialogue to generate as audible speech/);
  assert.match(prompt, /do not mix Chinese and English/i);
});
