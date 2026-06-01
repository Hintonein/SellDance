const { recallAssets } = require('./asset.service');

const ROLE_REQUIREMENTS = {
  hook: {
    preferredMediaType: 'video',
    requiredTags: [],
    optionalTags: ['hook', 'product', 'feature', 'motion', 'visual_impact'],
    keywords: ['hook', 'visual impact', 'quick movement', 'product highlight'],
    role: 'hook',
    visualIntent: 'strong opening visual with fast product benefit',
    fallbackStrategy: 'Upload a high-impact product video or image for the opening hook.',
    preferredAssetTypes: ['product_video', 'product_image', 'reference_video'],
  },
  product_closeup: {
    preferredMediaType: 'any',
    requiredTags: [],
    optionalTags: ['close_up', 'detail', 'product', 'material'],
    keywords: ['close up', 'detail', 'product texture', 'material'],
    role: 'product_closeup',
    visualIntent: 'product detail close-up',
    fallbackStrategy: 'Upload product close-up or detail material.',
    preferredAssetTypes: ['product_image', 'product_video'],
  },
  usage_demo: {
    preferredMediaType: 'video',
    requiredTags: [],
    optionalTags: ['usage', 'demo', 'action', 'scene'],
    keywords: ['usage', 'demo', 'action', 'real scene'],
    role: 'usage_demo',
    visualIntent: 'real usage demonstration',
    fallbackStrategy: 'Upload usage demo or action video material.',
    preferredAssetTypes: ['product_video', 'reference_video'],
  },
  selling_point: {
    preferredMediaType: 'any',
    requiredTags: [],
    optionalTags: ['selling_point', 'detail', 'material', 'feature'],
    keywords: ['selling point', 'feature', 'detail', 'benefit'],
    role: 'selling_point',
    visualIntent: 'visual proof of product feature',
    fallbackStrategy: 'Upload detail material that proves the selling point.',
    preferredAssetTypes: ['product_image', 'product_video'],
  },
  comparison: {
    preferredMediaType: 'any',
    requiredTags: [],
    optionalTags: ['comparison', 'before_after', 'feature'],
    keywords: ['comparison', 'before after', 'contrast'],
    role: 'comparison',
    visualIntent: 'before and after product comparison',
    fallbackStrategy: 'Upload comparison or before-after material.',
    preferredAssetTypes: ['product_image', 'product_video'],
  },
  cta: {
    preferredMediaType: 'image',
    requiredTags: [],
    optionalTags: ['product', 'logo', 'brand', 'end_card'],
    keywords: ['product', 'logo', 'brand', 'end card'],
    role: 'cta',
    visualIntent: 'clean end card with product and brand cue',
    fallbackStrategy: 'Upload product packshot, logo, or brand end-card material.',
    preferredAssetTypes: ['product_image', 'logo'],
  },
  transition: {
    preferredMediaType: 'any',
    requiredTags: [],
    optionalTags: ['transition', 'detail', 'motion'],
    keywords: ['transition', 'detail'],
    role: 'transition',
    visualIntent: 'short transition cutaway',
    fallbackStrategy: 'Upload transition detail material.',
    preferredAssetTypes: ['product_image', 'product_video'],
  },
};

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function buildAssetRequirements(scene = {}) {
  const role = scene.sceneRole || scene.role || 'selling_point';
  const defaults = ROLE_REQUIREMENTS[role] || ROLE_REQUIREMENTS.selling_point;
  const existing = scene.assetRequirements || {};
  const sellingPoint = scene.sellingPoint ? [scene.sellingPoint] : [];
  return {
    preferredMediaType: existing.preferredMediaType || defaults.preferredMediaType,
    requiredTags: normalizeArray(existing.requiredTags || defaults.requiredTags),
    optionalTags: [...new Set([...normalizeArray(defaults.optionalTags), ...normalizeArray(existing.optionalTags)])],
    keywords: [...new Set([...normalizeArray(defaults.keywords), ...normalizeArray(existing.keywords), ...sellingPoint])],
    duration: Number(existing.duration || scene.duration || scene.durationSeconds || defaults.duration || 3),
    role: existing.role || defaults.role,
    visualIntent: existing.visualIntent || scene.visualDescription || defaults.visualIntent,
    fallbackStrategy: existing.fallbackStrategy || defaults.fallbackStrategy,
    preferredAssetTypes: normalizeArray(existing.preferredAssetTypes || defaults.preferredAssetTypes),
  };
}

function requirementsToRecallQuery(requirements = {}) {
  return {
    preferredMediaType: requirements.preferredMediaType,
    mediaType: requirements.preferredMediaType && requirements.preferredMediaType !== 'any' ? requirements.preferredMediaType : undefined,
    requiredTags: requirements.requiredTags || [],
    optionalTags: requirements.optionalTags || [],
    keywords: requirements.keywords || [],
    duration: requirements.duration,
    sceneRole: requirements.role,
    visualIntent: requirements.visualIntent,
    preferredAssetTypes: requirements.preferredAssetTypes || [],
    purpose: 'storyboard',
    limit: 4,
  };
}

function mapRecallToSceneSelection(recall, requirements) {
  const items = Array.isArray(recall?.items) ? recall.items : [];
  const candidateAssets = items.map((item) => ({
    asset: item.asset,
    score: item.score,
    reason: item.reason,
    usageSuggestion: item.usageSuggestion,
  }));
  const candidateSlices = items.flatMap((item) => (item.matchedSlices || []).map((slice) => ({
    ...slice,
    assetId: slice.assetId || item.asset?.id,
    score: item.score,
    reason: item.reason,
    usageSuggestion: item.usageSuggestion,
  })));
  const first = items[0] || null;
  const firstSlice = first?.matchedSlices?.[0] || null;
  if (!first) {
    return {
      candidateAssets: [],
      candidateSlices: [],
      selectedAssetIds: [],
      selectedAssetSliceIds: [],
      fallbackReason: `No matching asset found. ${requirements.fallbackStrategy || 'Please upload matching product material.'}`,
    };
  }
  return {
    candidateAssets,
    candidateSlices,
    selectedAssetIds: first.asset?.id ? [first.asset.id] : [],
    selectedAssetSliceIds: firstSlice?.id ? [firstSlice.id] : [],
    fallbackReason: null,
  };
}

async function matchAssetsForScene(projectId, scene = {}, options = {}) {
  const requirements = buildAssetRequirements(scene);
  const recall = await recallAssets(projectId, { ...requirementsToRecallQuery(requirements), ...(options.recallQuery || {}) });
  return {
    assetRequirements: requirements,
    recall,
    ...mapRecallToSceneSelection(recall, requirements),
  };
}

async function matchAssetsForStoryboard(projectId, scenes = [], options = {}) {
  const items = [];
  for (const scene of scenes) {
    const match = await matchAssetsForScene(projectId, scene, options);
    items.push({ sceneId: scene.id || scene.sceneId, ...match });
  }
  return { items, total: items.length, mode: 'asset_recall' };
}

module.exports = {
  buildAssetRequirements,
  requirementsToRecallQuery,
  matchAssetsForScene,
  matchAssetsForStoryboard,
};
