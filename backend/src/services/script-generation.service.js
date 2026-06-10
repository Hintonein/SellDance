const { v4: uuidv4 } = require('uuid');
const { generateJsonWithSeed2 } = require('../providers/volcengine/seed2.client');
const { listGeneratedScripts, writeGeneratedScripts } = require('./storage.service');
const { getTemplate } = require('./inspiration-template.service');
const { SOURCE_DECLARATION, REUSE_DECLARATION } = require('./inspiration-video.service');
const { normalizeScript, saveScript } = require('./script.service');
const { resolveDialogueLanguage } = require('./language-policy.service');

const SCRIPT_SCHEMA = {
  narrativeFramework: ['opening', 'proof', 'demo', 'cta'],
  visualStyle: { palette: '...', composition: '...', lighting: '...' },
  storyboardShots: [
    {
      order: 1,
      startTime: 0,
      endTime: 3,
      duration: 3,
      sceneRole: 'hook',
      visualDescription: 'original shot plan',
      cameraMovement: 'camera movement',
      voiceover: 'voiceover',
      subtitle: 'subtitle',
      bgmCue: 'bgm cue',
      cta: '',
      constraints: ['constraint'],
    },
  ],
  bgm: { style: '...', rhythm: '...' },
  subtitles: ['subtitle line'],
  voiceover: ['voiceover line'],
  cta: { text: '...', placement: '...' },
  constraints: ['compliance/originality constraint'],
  complianceTips: ['tip'],
};

function now() {
  return new Date().toISOString();
}

function normalizeShot(shot = {}, index = 0) {
  const duration = Math.max(1, Number(shot.duration || (Number(shot.endTime) - Number(shot.startTime)) || 3));
  const startTime = Number.isFinite(Number(shot.startTime)) ? Number(shot.startTime) : index * duration;
  return {
    id: shot.id || `shot_${uuidv4()}`,
    order: Number(shot.order || index + 1),
    startTime,
    endTime: Number.isFinite(Number(shot.endTime)) ? Number(shot.endTime) : startTime + duration,
    duration,
    sceneRole: shot.sceneRole || shot.role || 'selling_point',
    visualDescription: shot.visualDescription || shot.visual || '',
    cameraMovement: shot.cameraMovement || '',
    voiceover: shot.voiceover || '',
    subtitle: shot.subtitle || '',
    bgmCue: shot.bgmCue || shot.bgm || '',
    cta: shot.cta || '',
    constraints: Array.isArray(shot.constraints) ? shot.constraints : [],
  };
}

function normalizeGeneratedScript(projectId, payload = {}, template = null, productInfo = {}) {
  const shots = Array.isArray(payload.storyboardShots) ? payload.storyboardShots.map(normalizeShot) : [];
  return {
    id: payload.id || `generated_script_${uuidv4()}`,
    projectId,
    templateId: template?.id || payload.templateId || null,
    productInfo,
    strategy: template?.strategy || payload.strategy || {},
    factors: template?.factors || payload.factors || {},
    narrativeFramework: Array.isArray(payload.narrativeFramework) ? payload.narrativeFramework : [],
    visualStyle: payload.visualStyle || {},
    storyboardShots: shots,
    bgm: payload.bgm || {},
    subtitles: Array.isArray(payload.subtitles) ? payload.subtitles : shots.map((shot) => shot.subtitle).filter(Boolean),
    voiceover: Array.isArray(payload.voiceover) ? payload.voiceover : shots.map((shot) => shot.voiceover).filter(Boolean),
    cta: payload.cta || {},
    constraints: Array.isArray(payload.constraints) ? payload.constraints : [],
    complianceTips: Array.isArray(payload.complianceTips) ? payload.complianceTips : ['Only use abstract strategy and factors; do not copy source videos.'],
    sourceDeclaration: SOURCE_DECLARATION,
    sourceTemplateDeclaration: REUSE_DECLARATION,
    provider: payload.provider || 'seed2',
    model: payload.model || '',
    rawText: payload.rawText || '',
    parseWarning: payload.parseWarning || null,
    createdAt: payload.createdAt || now(),
    updatedAt: now(),
  };
}

function toLegacyScriptPayload(generated) {
  return {
    id: generated.id,
    scriptId: generated.id,
    mode: 'template',
    productInfo: generated.productInfo,
    strategy: generated.strategy,
    factors: generated.factors,
    constraints: {
      originality: generated.sourceTemplateDeclaration,
      compliance: generated.complianceTips.join('; '),
    },
    scenes: generated.storyboardShots.map((shot) => ({
      id: shot.id,
      order: shot.order,
      index: shot.order - 1,
      duration: shot.duration,
      sceneRole: shot.sceneRole,
      narrativeGoal: shot.constraints.join('; '),
      visualDescription: shot.visualDescription,
      cameraMovement: shot.cameraMovement,
      voiceover: shot.voiceover,
      subtitle: shot.subtitle,
      bgm: shot.bgmCue,
      constraints: { cta: shot.cta, compliance: shot.constraints },
    })),
    source: 'seed2-template-script',
    input: generated,
  };
}

async function generateScriptFromTemplate(projectId, payload = {}) {
  const template = payload.templateId ? await getTemplate(projectId, payload.templateId) : null;
  if (payload.templateId && !template) {
    const error = new Error('Inspiration template not found.');
    error.statusCode = 404;
    throw error;
  }
  const productInfo = payload.productInfo || {
    title: payload.productTitle || payload.productName || payload.productInfo || 'Featured product',
    sellingPoints: payload.sellingPoints || [],
    targetAudience: payload.targetAudience || payload.audience || '',
    scene: payload.scene || '',
    brandTone: payload.brandTone || payload.style || '',
    duration: payload.duration || payload.expectedDuration || 15,
    platform: payload.platform || 'dy',
  };
  const languagePolicy = resolveDialogueLanguage({ ...payload, productInfo }, payload.language || payload.dialogueLanguage || productInfo.language);
  productInfo.dialogueLanguage = languagePolicy.dialogueLanguage;
  productInfo.languageReason = languagePolicy.languageReason;
  const raw = await generateJsonWithSeed2({
    systemPrompt: [
      'You generate original e-commerce short video scripts.',
      'Use the provided template only as abstract strategy and creative factors.',
      'Do not copy any source video wording, sequence, shot expression, music, or unique style.',
      languagePolicy.languageInstruction,
      'All storyboardShots.voiceover and storyboardShots.subtitle must follow the target dialogue language.',
      'Return a complete structured script with storyboard shots, BGM, subtitles, voiceover, CTA, constraints, and compliance tips.',
    ].join('\n'),
    userPrompt: JSON.stringify({
      productInfo,
      dialogueLanguage: languagePolicy.dialogueLanguage,
      languageInstruction: languagePolicy.languageInstruction,
      template,
      compliance: {
        sourceDeclaration: SOURCE_DECLARATION,
        reuseDeclaration: REUSE_DECLARATION,
        requirements: ['avoid unverifiable claims', 'make original scenes', 'do not reuse public video assets'],
      },
    }),
    schema: SCRIPT_SCHEMA,
    fetchImpl: payload.fetchImpl,
  });
  const generated = normalizeGeneratedScript(projectId, raw, template, productInfo);
  await writeGeneratedScripts(projectId, [generated, ...(await listGeneratedScripts(projectId))]);
  await saveScript(projectId, normalizeScript(projectId, toLegacyScriptPayload(generated)), {
    source: 'seed2-template-script',
    prompt: payload.prompt || 'template + product script generation',
  });
  return generated;
}

async function listScripts(projectId) {
  return listGeneratedScripts(projectId);
}

module.exports = {
  SCRIPT_SCHEMA,
  generateScriptFromTemplate,
  listScripts,
  normalizeGeneratedScript,
  toLegacyScriptPayload,
};
