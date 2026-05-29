const { v4: uuidv4 } = require('uuid');
const { generateScript, formatScriptText } = require('./ai-script.service');
const { readScript, writeScript } = require('./storage.service');

async function getScript(projectId) {
  return readScript(projectId);
}

async function saveScript(projectId, scriptText, meta = {}) {
  const existing = (await readScript(projectId)) || null;
  const version = {
    versionId: uuidv4(),
    versionNumber: (existing?.versions?.length || 0) + 1,
    prompt: meta.prompt || meta.source || 'manual',
    hook: scriptText.split(/[.!?]/)[0] || scriptText,
    painPoint: '',
    productIntroduction: '',
    sellingPoints: [],
    cta: '',
    tone: meta.tone || '',
    suggestedDuration: 15,
    sceneOutline: [],
    scriptText,
    createdAt: new Date().toISOString(),
  };
  const payload = {
    id: existing?.id || uuidv4(),
    scriptId: existing?.scriptId || uuidv4(),
    projectId,
    scriptText,
    selectedVersionId: version.versionId,
    versions: [...(existing?.versions || []), version],
    ...meta,
    updatedAt: new Date().toISOString(),
  };
  await writeScript(projectId, payload);
  return payload;
}

async function generateAndSaveScript(projectId, input) {
  const existing = (await readScript(projectId)) || null;
  const structured = generateScript(input);
  const version = {
    versionId: uuidv4(),
    versionNumber: (existing?.versions?.length || 0) + 1,
    prompt: input.prompt || input.refinePrompt || '找参考 -> 提炼方法论 -> 生产脚本',
    ...structured,
    scriptText: formatScriptText(structured),
    createdAt: new Date().toISOString(),
  };
  const payload = {
    id: existing?.id || uuidv4(),
    scriptId: existing?.scriptId || uuidv4(),
    projectId,
    scriptText: version.scriptText,
    selectedVersionId: version.versionId,
    versions: [...(existing?.versions || []), version],
    input,
    source: input.refinePrompt ? 'mock-ai-refine' : 'mock-ai',
    updatedAt: new Date().toISOString(),
  };
  await writeScript(projectId, payload);
  return payload;
}


async function listScripts(projectId) {
  const script = await getScript(projectId);
  return script ? [script] : [];
}
async function createScript(projectId, payload = {}) {
  return saveScript(projectId, payload.scriptText || payload.text || '', { source: payload.source || 'manual' });
}
async function updateScript(projectId, _scriptId, payload = {}) {
  return saveScript(projectId, payload.scriptText || payload.text || '', { source: payload.source || 'manual-update' });
}
async function generateScriptRecord(projectId, payload = {}) {
  return generateAndSaveScript(projectId, payload);
}
async function regenerateScript(projectId, _scriptId, payload = {}) {
  return generateAndSaveScript(projectId, payload);
}

module.exports = {
  getScript,
  listScripts,
  createScript,
  updateScript,
  generateScript: generateScriptRecord,
  regenerateScript,
  saveScript,
  generateAndSaveScript,
};
