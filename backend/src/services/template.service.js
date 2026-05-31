const { v4: uuidv4 } = require('uuid');
const { listTemplates: readTemplates, writeTemplates } = require('./storage.service');
function now() { return new Date().toISOString(); }
async function listTemplates(filters = {}) {
  const rows = await readTemplates();
  return rows.filter((tpl) => !filters.category || tpl.category === filters.category);
}
async function getTemplate(templateId) { return (await readTemplates()).find((tpl) => tpl.id === templateId) || null; }
async function createTemplate(payload = {}) {
  const item = { id: `template_${uuidv4()}`, name: payload.name || 'Untitled template', category: payload.category || 'general', strategy: payload.strategy || '', factors: payload.factors || [], constraints: payload.constraints || [], exampleReferenceVideoIds: payload.exampleReferenceVideoIds || [], createdAt: now(), updatedAt: now() };
  await writeTemplates([item, ...(await readTemplates())]);
  return item;
}
async function mineTemplate(payload = {}) {
  const modelProvider = require('./model-provider.service');
  const mined = await modelProvider.mineCreativeTemplate(payload);
  return createTemplate(mined);
}
async function updateTemplate(templateId, payload = {}) {
  const rows = await readTemplates(); let updated = null;
  const next = rows.map((tpl) => tpl.id === templateId ? (updated = { ...tpl, ...payload, id: tpl.id, updatedAt: now() }) : tpl);
  if (!updated) return null;
  await writeTemplates(next); return updated;
}
async function deleteTemplate(templateId) {
  const rows = await readTemplates(); const target = rows.find((tpl) => tpl.id === templateId);
  if (!target) return null; await writeTemplates(rows.filter((tpl) => tpl.id !== templateId)); return target;
}
module.exports = { listTemplates, getTemplate, createTemplate, mineTemplate, updateTemplate, deleteTemplate };
