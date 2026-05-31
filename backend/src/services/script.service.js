const { v4: uuidv4 } = require('uuid');
const { readScript, writeScript } = require('./storage.service');

const SCENE_ROLES = [
  'hook',
  'product_closeup',
  'usage_demo',
  'selling_point',
  'comparison',
  'cta',
];

function now() {
  return new Date().toISOString();
}

function arrayFrom(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function normalizeMode(mode) {
  return ['free', 'template', 'reference_rewrite', 'automated'].includes(mode) ? mode : 'free';
}

function clampDuration(value, fallback = 3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(6, Number(parsed.toFixed(1))));
}

function buildProductInfo(input = {}) {
  const source = input.productInfo && typeof input.productInfo === 'object'
    ? input.productInfo
    : {
        title: input.productInfo || input.productTitle || input.productName || 'Featured product',
        category: input.productCategory || input.category || '',
      };
  return {
    title: source.title || source.name || input.productTitle || input.productName || 'Featured product',
    category: source.category || input.productCategory || input.category || '',
    sellingPoints: arrayFrom(source.sellingPoints || input.sellingPoints),
    targetAudience: source.targetAudience || input.targetAudience || input.audience || '',
    platform: source.platform || input.platform || 'TikTok Shop',
  };
}

function roleDefaults(role, productInfo, point, input = {}) {
  const title = productInfo.title || 'this product';
  const style = input.style || input.tone || 'clean_ecommerce';
  const fallbackPoint = point || productInfo.sellingPoints?.[0] || 'clear product value';
  const rows = {
    hook: {
      duration: 2,
      sellingPoint: fallbackPoint,
      narrativeGoal: 'Stop scroll within the first three seconds.',
      visualDescription: `Fast opening shot showing ${title} with the strongest visible benefit: ${fallbackPoint}.`,
      cameraMovement: 'quick push-in with fast cut',
      voiceover: `Stop scrolling. ${title} solves ${fallbackPoint} in seconds.`,
      subtitle: `${fallbackPoint} 一眼看懂`,
      bgm: 'upbeat hook beat',
    },
    product_closeup: {
      duration: 3,
      sellingPoint: fallbackPoint,
      narrativeGoal: 'Show product texture, detail, and credibility.',
      visualDescription: `Close-up detail shots of ${title}, highlighting material, finish, buttons, logo, or product texture.`,
      cameraMovement: 'slow macro push-in',
      voiceover: `Look closer at the details that make ${title} different.`,
      subtitle: '细节做工清楚呈现',
      bgm: 'clean product pulse',
    },
    usage_demo: {
      duration: 3,
      sellingPoint: fallbackPoint,
      narrativeGoal: 'Demonstrate the product in a real usage moment.',
      visualDescription: `Hands-on usage scene showing ${title} in context for ${productInfo.targetAudience || 'daily shoppers'}.`,
      cameraMovement: 'handheld action follow',
      voiceover: `Use it in your daily routine and feel the difference immediately.`,
      subtitle: '真实场景直接演示',
      bgm: 'active demo rhythm',
    },
    selling_point: {
      duration: 3,
      sellingPoint: fallbackPoint,
      narrativeGoal: 'Explain one concrete selling point with visual proof.',
      visualDescription: `Feature proof shot for ${fallbackPoint}, with simple overlays and product detail cutaways.`,
      cameraMovement: 'steady pan with insert shot',
      voiceover: `${fallbackPoint} is the reason customers come back for this product.`,
      subtitle: fallbackPoint,
      bgm: 'confident commerce bed',
    },
    comparison: {
      duration: 2,
      sellingPoint: fallbackPoint,
      narrativeGoal: 'Make the improvement obvious through before/after contrast.',
      visualDescription: `Before-and-after comparison that makes ${fallbackPoint} easy to understand without exaggeration.`,
      cameraMovement: 'split-screen cut',
      voiceover: `Compared with the old way, this is simpler and cleaner.`,
      subtitle: '前后对比更直观',
      bgm: 'tight comparison beat',
    },
    cta: {
      duration: 2,
      sellingPoint: fallbackPoint,
      narrativeGoal: 'Drive purchase action and close with product/brand memory.',
      visualDescription: `End card with ${title}, package, logo or store cue, and a clean purchase prompt.`,
      cameraMovement: 'static end card with subtle zoom',
      voiceover: `Tap the product card and get ${title} today.`,
      subtitle: '点击购买 立即入手',
      bgm: 'short CTA sting',
    },
  };
  return { ...rows[role], style };
}

function normalizeScriptScene(scene = {}, index = 0, input = {}) {
  const productInfo = buildProductInfo(input);
  const role = SCENE_ROLES.includes(scene.sceneRole) ? scene.sceneRole : SCENE_ROLES[Math.min(index, SCENE_ROLES.length - 1)];
  const defaults = roleDefaults(role, productInfo, scene.sellingPoint, input);
  const duration = clampDuration(scene.duration, defaults.duration);
  return {
    id: scene.id || scene.sceneId || `script_scene_${uuidv4()}`,
    index: Number(scene.index ?? index),
    order: Number(scene.order ?? index + 1),
    duration,
    sceneRole: role,
    sellingPoint: scene.sellingPoint || defaults.sellingPoint,
    narrativeGoal: scene.narrativeGoal || defaults.narrativeGoal,
    visualDescription: scene.visualDescription || defaults.visualDescription,
    cameraMovement: scene.cameraMovement || scene.cameraMotion || defaults.cameraMovement,
    voiceover: scene.voiceover || scene.narration || scene.scriptText || defaults.voiceover,
    subtitle: scene.subtitle || scene.subtitleText || defaults.subtitle,
    bgm: scene.bgm || scene.bgmHint || defaults.bgm,
    style: scene.style || defaults.style,
    constraints: scene.constraints && typeof scene.constraints === 'object' ? scene.constraints : {},
  };
}

function clampScenesTo15Seconds(scenes) {
  const total = scenes.reduce((sum, scene) => sum + Number(scene.duration || 0), 0);
  if (total <= 15 || total <= 0) return scenes;
  const ratio = 15 / total;
  return scenes.map((scene) => ({ ...scene, duration: Math.max(1, Number((scene.duration * ratio).toFixed(1))) }));
}

function buildMockScenes(input = {}) {
  const productInfo = buildProductInfo(input);
  const points = productInfo.sellingPoints.length ? productInfo.sellingPoints : ['visible product benefit', 'reliable detail'];
  const roles = points.length >= 3
    ? ['hook', 'product_closeup', 'usage_demo', 'selling_point', 'cta']
    : ['hook', 'product_closeup', 'usage_demo', 'cta'];
  return clampScenesTo15Seconds(roles.map((role, index) => normalizeScriptScene({
    sceneRole: role,
    sellingPoint: points[index - 1] || points[index] || points[0],
  }, index, input)));
}

function formatScriptText(script) {
  return (script.scenes || [])
    .sort((a, b) => a.order - b.order)
    .map((scene) => `${scene.order}. [${scene.sceneRole}] ${scene.voiceover} / ${scene.subtitle}`)
    .join('\n');
}

function buildVersion(script, prompt, source) {
  return {
    versionId: uuidv4(),
    versionNumber: (script.versions?.length || 0) + 1,
    prompt: prompt || 'structured script generation',
    source,
    scenes: script.scenes,
    scriptText: formatScriptText(script),
    totalDuration: script.totalDuration,
    createdAt: now(),
  };
}

function normalizeScript(projectId, payload = {}, existing = null) {
  const productInfo = buildProductInfo(payload.input || payload.productInfo ? payload : existing?.input || {});
  const input = { ...(existing?.input || {}), ...(payload.input || {}), ...payload, productInfo };
  const scenes = clampScenesTo15Seconds(
    Array.isArray(payload.scenes) && payload.scenes.length
      ? payload.scenes.map((scene, index) => normalizeScriptScene(scene, index, input))
      : buildMockScenes(input)
  ).map((scene, index) => ({ ...scene, index, order: index + 1 }));
  const totalDuration = Number(scenes.reduce((sum, scene) => sum + Number(scene.duration || 0), 0).toFixed(1));
  const timestamp = existing?.createdAt || now();
  const base = {
    id: payload.id || existing?.id || uuidv4(),
    scriptId: payload.scriptId || existing?.scriptId || payload.id || existing?.id || uuidv4(),
    projectId,
    mode: normalizeMode(payload.mode || input.mode),
    productInfo,
    strategy: payload.strategy || input.strategy || {
      name: input.prompt || 'direct_commerce_story',
      description: 'Hook, product proof, usage demo, benefit, CTA.',
    },
    factors: payload.factors || input.factors || {
      hook: 'fast visual benefit',
      proof: 'close-up and usage demonstration',
      cta: 'direct purchase prompt',
    },
    constraints: payload.constraints || input.constraints || {
      maxDuration: 15,
      aspectRatio: '9:16',
      compliance: 'avoid unverifiable claims',
    },
    scenes,
    totalDuration,
    versions: Array.isArray(existing?.versions) ? existing.versions : [],
    input,
    source: payload.source || existing?.source || 'mock-ai',
    scriptText: payload.scriptText || formatScriptText({ scenes }),
    createdAt: timestamp,
    updatedAt: now(),
  };
  return base;
}

async function getScript(projectId) {
  const existing = await readScript(projectId);
  return existing ? normalizeScript(projectId, existing, existing) : null;
}

async function writeScriptRecord(projectId, script, prompt = '', source = 'manual') {
  const version = buildVersion(script, prompt, source);
  const payload = {
    ...script,
    selectedVersionId: version.versionId,
    versions: [...(script.versions || []), version],
    scriptText: version.scriptText,
    updatedAt: now(),
  };
  await writeScript(projectId, payload);
  return payload;
}

async function saveScript(projectId, scriptOrText, meta = {}) {
  const existing = await getScript(projectId);
  const payload = typeof scriptOrText === 'string'
    ? { ...(existing || {}), scriptText: scriptOrText, scenes: existing?.scenes || [], source: meta.source || 'manual' }
    : { ...(existing || {}), ...(scriptOrText || {}), source: meta.source || scriptOrText?.source || 'manual' };
  const normalized = normalizeScript(projectId, payload, existing);
  return writeScriptRecord(projectId, normalized, meta.prompt || payload.prompt || 'manual edit', meta.source || 'manual');
}

async function generateAndSaveScript(projectId, input = {}) {
  const existing = await getScript(projectId);
  const normalized = normalizeScript(projectId, { ...input, source: input.refinePrompt ? 'mock-ai-refine' : 'mock-ai' }, existing);
  return writeScriptRecord(projectId, normalized, input.refinePrompt || input.prompt || 'structured script generation', normalized.source);
}

async function listScripts(projectId) {
  const script = await getScript(projectId);
  return script ? [script] : [];
}

async function createScript(projectId, payload = {}) {
  return saveScript(projectId, payload, { source: payload.source || 'manual-create' });
}

async function updateScript(projectId, scriptId, payload = {}) {
  const existing = await getScript(projectId);
  if (!existing || (scriptId && ![existing.id, existing.scriptId].includes(scriptId))) return null;
  return saveScript(projectId, payload, { source: payload.source || 'manual-update', prompt: payload.prompt });
}

async function regenerateScript(projectId, scriptId, payload = {}) {
  const existing = await getScript(projectId);
  if (!existing || (scriptId && ![existing.id, existing.scriptId].includes(scriptId))) return null;
  return generateAndSaveScript(projectId, { ...(existing.input || {}), ...payload, refinePrompt: payload.prompt || payload.refinePrompt || 'regenerate script' });
}

async function regenerateScriptScene(projectId, scriptId, sceneId, payload = {}) {
  const existing = await getScript(projectId);
  if (!existing || (scriptId && ![existing.id, existing.scriptId].includes(scriptId))) return null;
  const index = existing.scenes.findIndex((scene) => scene.id === sceneId || String(scene.order) === String(sceneId));
  if (index === -1) return null;
  const prompt = payload.prompt || payload.refinePrompt || '';
  const current = existing.scenes[index];
  const regenerated = normalizeScriptScene({
    ...current,
    ...payload,
    visualDescription: payload.visualDescription || `${current.visualDescription} Updated for: ${prompt || 'scene refresh'}.`,
    voiceover: payload.voiceover || `${current.voiceover} ${prompt ? `(${prompt})` : ''}`.trim(),
    subtitle: payload.subtitle || current.subtitle,
  }, index, existing.input || {});
  const scenes = existing.scenes.map((scene, sceneIndex) => (sceneIndex === index ? regenerated : scene));
  return saveScript(projectId, { ...existing, scenes }, { source: 'mock-scene-regenerate', prompt });
}

module.exports = {
  getScript,
  listScripts,
  createScript,
  updateScript,
  generateScript: generateAndSaveScript,
  regenerateScript,
  regenerateScriptScene,
  saveScript,
  generateAndSaveScript,
  normalizeScript,
  normalizeScriptScene,
  formatScriptText,
};
