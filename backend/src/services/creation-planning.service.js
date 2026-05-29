const { v4: uuidv4 } = require('uuid');
const { recallAssets } = require('./asset.service');
const { listEditingPlans, writeEditingPlans } = require('./storage.service');

function now() { return new Date().toISOString(); }
function normalizeMode(mode) { return mode === 'storyboard_driven' ? 'storyboard_driven' : 'asset_first'; }
async function savePlan(plan) {
  const plans = await listEditingPlans();
  await writeEditingPlans([plan, ...plans.filter((item) => item.id !== plan.id)]);
  return plan;
}
async function createAssetFirstPlan(projectId, payload = {}) {
  const targetDuration = Math.min(15, Number(payload.targetDuration || 15));
  const recalled = await recallAssets(projectId, { tags: payload.tags || [], keyword: payload.editingGoal || payload.keyword || '', limit: 6, purpose: 'creation' });
  const selected = payload.assetIds?.length
    ? recalled.items.filter((item) => payload.assetIds.includes(item.asset.id))
    : recalled.items;
  const base = selected.length ? selected : recalled.items;
  const stepDuration = Math.max(2, Math.round(targetDuration / Math.max(1, Math.min(5, base.length || 1))));
  const plan = {
    id: `editing_plan_${uuidv4()}`,
    projectId,
    mode: 'asset_first',
    targetDuration,
    aspectRatio: payload.aspectRatio || '9:16',
    style: payload.style || 'mock commerce edit',
    steps: (base.length ? base : [{ asset: {} }]).slice(0, 5).map((item, index) => ({
      index: index + 1,
      duration: stepDuration,
      assetId: item.asset?.id || null,
      assetSliceId: item.slices?.[0]?.id || null,
      visualDescription: item.asset?.analysis?.summary || item.asset?.title || `Asset-first placeholder shot ${index + 1}`,
      subtitle: index === 0 ? 'Hook: see it in action' : 'Product detail moment',
      transition: index === 0 ? 'cut' : 'quick cut',
      reason: item.reason || 'Mock asset-first editing step.',
    })),
    createdAt: now(),
    updatedAt: now(),
  };
  return savePlan(plan);
}
async function createStoryboardDrivenPlan(projectId, payload = {}) {
  const scenes = payload.scenes || [];
  const plan = {
    id: `editing_plan_${uuidv4()}`,
    projectId,
    mode: 'storyboard_driven',
    targetDuration: Math.min(15, Number(payload.targetDuration || scenes.reduce((sum, scene) => sum + Number(scene.duration || scene.durationSeconds || 3), 0) || 15)),
    aspectRatio: payload.aspectRatio || '9:16',
    style: payload.style || 'mock storyboard edit',
    steps: scenes.map((scene, index) => ({
      index: index + 1,
      duration: Number(scene.duration || scene.durationSeconds || 3),
      assetId: scene.selectedAssetIds?.[0] || scene.assetRefs?.[0] || null,
      assetSliceId: scene.selectedAssetSliceIds?.[0] || null,
      visualDescription: scene.visualDescription || scene.scriptText || `Storyboard scene ${index + 1}`,
      subtitle: scene.subtitle || scene.subtitleText || '',
      transition: scene.transition || 'cut',
      reason: 'Mock storyboard-driven editing step.',
    })),
    createdAt: now(),
    updatedAt: now(),
  };
  return savePlan(plan);
}
async function createEditingPlan(projectId, payload = {}) {
  return normalizeMode(payload.mode) === 'storyboard_driven'
    ? createStoryboardDrivenPlan(projectId, payload)
    : createAssetFirstPlan(projectId, payload);
}
module.exports = { createAssetFirstPlan, createStoryboardDrivenPlan, createEditingPlan };
