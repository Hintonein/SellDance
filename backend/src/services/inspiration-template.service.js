const { v4: uuidv4 } = require('uuid');
const { generateJsonWithSeed2 } = require('../providers/volcengine/seed2.client');
const { listInspirationTemplates, writeInspirationTemplates, listVideoAnalysisReports } = require('./storage.service');
const { SOURCE_DECLARATION, REUSE_DECLARATION } = require('./inspiration-video.service');

const TEMPLATE_SCHEMA = {
  name: 'template name',
  category: 'category',
  strategy: { name: 'abstract strategy name', description: 'abstract creation strategy' },
  factors: {
    opening: ['opening factors'],
    ending: ['ending factors'],
    camera: ['camera factors'],
    subtitle: ['subtitle factors'],
    bgm: ['bgm factors'],
    rhythm: ['rhythm factors'],
    voiceover: ['voiceover factors'],
    visualStyle: ['visual factors'],
  },
  complianceNotes: ['source and originality notes'],
};

function now() {
  return new Date().toISOString();
}

function normalizeTemplate(projectId, payload = {}, sourceReports = []) {
  return {
    id: payload.id || `insp_tpl_${uuidv4()}`,
    projectId,
    name: payload.name || payload.strategy?.name || 'Untitled inspiration template',
    category: payload.category || 'general',
    strategy: payload.strategy || { name: payload.name || 'abstract_strategy', description: '' },
    factors: payload.factors || {},
    sourceVideoIds: payload.sourceVideoIds || sourceReports.map((report) => report.videoId).filter(Boolean),
    sourceReportIds: payload.sourceReportIds || sourceReports.map((report) => report.id).filter(Boolean),
    complianceNotes: payload.complianceNotes || ['Only use abstract strategy and factors; do not copy source videos.'],
    sourceDeclaration: SOURCE_DECLARATION,
    reuseDeclaration: REUSE_DECLARATION,
    provider: payload.provider || 'seed2',
    model: payload.model || '',
    rawText: payload.rawText || '',
    parseWarning: payload.parseWarning || null,
    createdAt: payload.createdAt || now(),
    updatedAt: now(),
  };
}

async function listTemplates(projectId, filters = {}) {
  const rows = await listInspirationTemplates(projectId);
  return rows.filter((tpl) => !filters.category || tpl.category === filters.category);
}

async function getTemplate(projectId, templateId) {
  return (await listInspirationTemplates(projectId)).find((tpl) => tpl.id === templateId) || null;
}

async function deleteTemplate(projectId, templateId) {
  const rows = await listInspirationTemplates(projectId);
  const target = rows.find((tpl) => tpl.id === templateId);
  if (!target) return null;
  await writeInspirationTemplates(projectId, rows.filter((tpl) => tpl.id !== templateId));
  return target;
}

async function generateTemplate(projectId, payload = {}) {
  const reportRows = await listVideoAnalysisReports(projectId);
  const selected = reportRows.filter((report) => (payload.reportIds || []).includes(report.id) || (payload.videoIds || []).includes(report.videoId));
  if (!selected.length) {
    const error = new Error('At least one analyzed inspiration video is required.');
    error.statusCode = 400;
    throw error;
  }
  const raw = await generateJsonWithSeed2({
    systemPrompt: [
      'You mine abstract creative methodology from structured reports of public videos.',
      'Do not copy wording, shots, music, or unique expression from any source video.',
      'Return a reusable e-commerce inspiration template with strategy and concrete factors.',
    ].join('\n'),
    userPrompt: JSON.stringify({
      name: payload.name,
      category: payload.category || selected[0]?.category || 'general',
      reports: selected.map((report) => ({
        id: report.id,
        videoId: report.videoId,
        hook: report.hook,
        sellingPoints: report.sellingPoints,
        narrativeStructure: report.narrativeStructure,
        storyboard: report.storyboard,
        visualStyle: report.visualStyle,
        bgmStyle: report.bgmStyle,
        voiceoverStyle: report.voiceoverStyle,
        subtitleStyle: report.subtitleStyle,
        cameraMovement: report.cameraMovement,
        reusableTakeaways: report.reusableTakeaways,
        complianceRisks: report.complianceRisks,
      })),
      sourceDeclaration: SOURCE_DECLARATION,
      reuseDeclaration: REUSE_DECLARATION,
    }),
    schema: TEMPLATE_SCHEMA,
    fetchImpl: payload.fetchImpl,
  });
  const template = normalizeTemplate(projectId, {
    ...raw,
    name: raw.name || payload.name,
    category: raw.category || payload.category || 'general',
  }, selected);
  await writeInspirationTemplates(projectId, [template, ...(await listInspirationTemplates(projectId))]);
  return template;
}

module.exports = {
  TEMPLATE_SCHEMA,
  listTemplates,
  getTemplate,
  deleteTemplate,
  generateTemplate,
  normalizeTemplate,
};
