function asLowerText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.toLowerCase();
  try {
    return JSON.stringify(value).toLowerCase();
  } catch {
    return String(value).toLowerCase();
  }
}

function includesKeyword(asset, keyword) {
  if (!keyword) return true;
  const text = asLowerText([
    asset.title,
    asset.description,
    asset.name,
    asset.originalName,
    asset.tags,
    asset.metadata,
    asset.analysis,
  ]);
  return text.includes(String(keyword).toLowerCase());
}

function matchesTags(asset, tags = []) {
  const required = (Array.isArray(tags) ? tags : [tags]).map((tag) => String(tag || '').trim().toLowerCase()).filter(Boolean);
  if (required.length === 0) return true;
  const actual = new Set((asset.tags || []).map((tag) => String(tag).toLowerCase()));
  const analysisTags = asset.analysis?.tags || [];
  analysisTags.forEach((tag) => actual.add(String(tag).toLowerCase()));
  return required.every((tag) => actual.has(tag));
}

function filterAssets(assets, filters = {}) {
  const keyword = filters.keyword || '';
  const tagFilters = filters.tags || filters.tag || [];
  return assets.filter((asset) => {
    if (filters.type && asset.type !== filters.type) return false;
    if (filters.source && asset.source !== filters.source) return false;
    if (!includesKeyword(asset, keyword)) return false;
    if (!matchesTags(asset, tagFilters)) return false;
    return true;
  });
}

function paginateAssets(assets, { limit, offset } = {}) {
  const total = assets.length;
  const normalizedOffset = Math.max(0, Number(offset || 0));
  const normalizedLimit = Math.max(0, Math.min(100, Number(limit || total || 0)));
  const items = normalizedLimit === 0 ? assets.slice(normalizedOffset) : assets.slice(normalizedOffset, normalizedOffset + normalizedLimit);
  return {
    items,
    total,
    limit: normalizedLimit || total,
    offset: normalizedOffset,
  };
}

function searchAssets(assets, filters = {}) {
  const sorted = [...filterAssets(assets, filters)].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return paginateAssets(sorted, filters);
}

module.exports = {
  filterAssets,
  searchAssets,
};
