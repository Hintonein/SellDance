const { normalizeTags, hasAllTags, countTagMatches } = require('./asset-tag.service');

function asLowerText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.toLowerCase();
  try { return JSON.stringify(value).toLowerCase(); } catch { return String(value).toLowerCase(); }
}

function queryKeywords(filters = {}) {
  return normalizeTags([filters.keyword, ...(Array.isArray(filters.keywords) ? filters.keywords : [])]).filter(Boolean);
}

function assetText(asset) {
  return asLowerText([asset.title, asset.description, asset.name, asset.originalName, asset.tags, asset.userTags, asset.systemTags, asset.metadata, asset.analysis]);
}

function sliceText(slice) {
  return asLowerText([slice.visualDescription, slice.transcript, slice.tags, slice.userTags, slice.systemTags, slice.metadata]);
}

function includesKeyword(asset, keyword) {
  if (!keyword) return true;
  return assetText(asset).includes(String(keyword).toLowerCase());
}

function assetMatchesBaseFilters(asset, filters = {}) {
  if (filters.type && asset.type !== filters.type) return false;
  if (filters.source && asset.source !== filters.source) return false;
  if (filters.mediaType && asset.mediaType !== filters.mediaType) return false;
  if (filters.analysisStatus && asset.analysisStatus !== filters.analysisStatus) return false;
  if (filters.preferredAssetTypes?.length && !filters.preferredAssetTypes.includes(asset.assetType) && !filters.preferredAssetTypes.includes(asset.type)) return false;
  return true;
}

function matchesTags(asset, tags = []) {
  const required = normalizeTags(Array.isArray(tags) ? tags : [tags]);
  if (required.length === 0) return true;
  return hasAllTags([...(asset.tags || []), ...(asset.analysis?.tags || [])], required);
}

function filterAssets(assets, filters = {}) {
  const keyword = filters.keyword || '';
  const tagFilters = filters.tags || filters.tag || [];
  return assets.filter((asset) => {
    if (!assetMatchesBaseFilters(asset, filters)) return false;
    if (!includesKeyword(asset, keyword)) return false;
    if (!matchesTags(asset, tagFilters)) return false;
    return true;
  });
}

function paginate(items, { limit, topK, offset } = {}) {
  const total = items.length;
  const normalizedOffset = Math.max(0, Number(offset || 0));
  const requestedLimit = topK || limit;
  const normalizedLimit = requestedLimit === undefined ? total : Math.max(0, Math.min(100, Number(requestedLimit || 0)));
  const paged = normalizedLimit === 0 ? items.slice(normalizedOffset) : items.slice(normalizedOffset, normalizedOffset + normalizedLimit);
  return { items: paged, total, limit: normalizedLimit || total, offset: normalizedOffset };
}

function searchAssets(assets, filters = {}) {
  const sorted = [...filterAssets(assets, filters)].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return paginate(sorted, filters);
}

function scoreSlice(slice, filters = {}) {
  const requiredTags = normalizeTags(filters.requiredTags || filters.tags || filters.tag || []);
  if (requiredTags.length && !hasAllTags(slice.tags || [], requiredTags)) return null;
  const optionalTags = normalizeTags(filters.optionalTags || []);
  const keywords = queryKeywords(filters);
  let score = 0;
  const reasons = [];
  const text = sliceText(slice);
  const keywordHits = keywords.filter((keyword) => text.includes(keyword));
  if (keywordHits.length) { score += 0.25 + keywordHits.length * 0.05; reasons.push('slice keyword match: ' + keywordHits.join(', ')); }
  const requiredMatches = countTagMatches(slice.tags || [], requiredTags);
  if (requiredMatches) { score += 0.35 + requiredMatches * 0.04; reasons.push('slice required tag match'); }
  const optionalMatches = countTagMatches(slice.tags || [], optionalTags);
  if (optionalMatches) { score += optionalMatches * 0.04; reasons.push('slice optional tag match'); }
  if (filters.duration && slice.duration) {
    const diff = Math.abs(Number(filters.duration) - Number(slice.duration));
    if (diff <= 1.5) { score += 0.08; reasons.push('slice duration fit'); }
  }
  if (score === 0 && !keywords.length && !requiredTags.length && !optionalTags.length) score = 0.1;
  return { score, reasons };
}

function scoreAsset(asset, slices = [], filters = {}) {
  if (!assetMatchesBaseFilters(asset, filters)) return null;
  const requiredTags = normalizeTags(filters.requiredTags || filters.tags || filters.tag || []);
  if (requiredTags.length && !hasAllTags([...(asset.tags || []), ...(asset.analysis?.tags || [])], requiredTags)) {
    const sliceHasRequired = slices.some((slice) => hasAllTags(slice.tags || [], requiredTags));
    if (!sliceHasRequired) return null;
  }
  const optionalTags = normalizeTags(filters.optionalTags || []);
  const keywords = queryKeywords(filters);
  let score = 0.1;
  const reasons = [];
  const text = assetText(asset);
  const keywordHits = keywords.filter((keyword) => text.includes(keyword));
  if (keywordHits.length) { score += 0.25 + keywordHits.length * 0.05; reasons.push('asset keyword match: ' + keywordHits.join(', ')); }
  const requiredMatches = countTagMatches([...(asset.tags || []), ...(asset.analysis?.tags || [])], requiredTags);
  if (requiredMatches) { score += 0.35 + requiredMatches * 0.04; reasons.push('asset required tag match'); }
  const optionalMatches = countTagMatches([...(asset.tags || []), ...(asset.analysis?.tags || [])], optionalTags);
  if (optionalMatches) { score += optionalMatches * 0.04; reasons.push('asset optional tag match'); }
  if (filters.mediaType && asset.mediaType === filters.mediaType) { score += 0.08; reasons.push('media type match'); }
  if (filters.visualIntent && text.includes(String(filters.visualIntent).toLowerCase())) { score += 0.06; reasons.push('visual intent match'); }
  const sliceScores = slices.map((slice) => ({ slice, result: scoreSlice(slice, filters) })).filter((item) => item.result && item.result.score > 0);
  if (sliceScores.length) {
    score += Math.min(0.3, Math.max(...sliceScores.map((item) => item.result.score)));
    reasons.push('matched slices available');
  }
  if (keywords.length && !keywordHits.length && !sliceScores.length) return null;
  return {
    asset,
    matchedSlices: sliceScores.sort((a, b) => b.result.score - a.result.score).map((item) => item.slice),
    score: Number(Math.min(1, score).toFixed(3)),
    reason: reasons.length ? reasons.join('; ') : 'baseline asset match',
  };
}

function usageSuggestionFor(match, filters = {}) {
  const text = asLowerText([filters.sceneRole, filters.visualIntent, filters.keywords, filters.requiredTags, filters.optionalTags, match.asset.tags, match.matchedSlices?.map((slice) => slice.tags)]);
  if (text.includes('hook')) return 'use_as_hook';
  if (text.includes('close_up') || text.includes('closeup') || text.includes('特写')) return 'use_as_product_closeup';
  if (text.includes('usage') || text.includes('使用') || text.includes('demo')) return 'use_as_usage_demo';
  if (text.includes('detail') || text.includes('细节')) return 'use_as_detail_cutaway';
  if (text.includes('transition')) return 'use_as_transition';
  return match.asset.mediaType === 'video' ? 'use_as_usage_demo' : 'use_as_product_closeup';
}

function searchAssetMatches(assets, slices = [], filters = {}) {
  const byAsset = new Map();
  slices.forEach((slice) => {
    if (!byAsset.has(slice.assetId)) byAsset.set(slice.assetId, []);
    byAsset.get(slice.assetId).push(slice);
  });
  const matches = assets
    .map((asset) => scoreAsset(asset, byAsset.get(asset.id) || [], filters))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || String(b.asset.createdAt || '').localeCompare(String(a.asset.createdAt || '')));
  const paged = paginate(matches, filters);
  return { ...paged, mode: 'rule_based_asset_slice_search' };
}

function buildRecallResult(assets, slices = [], filters = {}) {
  const result = searchAssetMatches(assets, slices, filters);
  return {
    ...result,
    items: result.items.map((match) => ({ ...match, usageSuggestion: usageSuggestionFor(match, filters) })),
    mode: 'rule_based_asset_slice_recall',
  };
}

module.exports = {
  filterAssets,
  searchAssets,
  searchAssetMatches,
  buildRecallResult,
};
