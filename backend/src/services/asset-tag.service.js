const tagAliases = new Map([
  ['特写', 'close_up'],
  ['近景', 'close_up'],
  ['商品', 'product'],
  ['产品', 'product'],
  ['使用', 'usage'],
  ['演示', 'usage'],
  ['开箱', 'unboxing'],
  ['细节', 'detail'],
  ['详情', 'detail'],
  ['对比', 'comparison'],
  ['比较', 'comparison'],
]);

function splitTags(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return String(value).split(',');
}

function normalizeTag(tag) {
  const raw = String(tag || '').trim();
  if (!raw) return '';
  const aliased = tagAliases.get(raw) || tagAliases.get(raw.toLowerCase()) || raw;
  return String(aliased).trim().toLowerCase().replace(/\s+/g, '_');
}

function normalizeTags(value) {
  return [...new Set(splitTags(value).map(normalizeTag).filter(Boolean))];
}

function mergeTags(...groups) {
  return normalizeTags(groups.flatMap((group) => splitTags(group)));
}

function normalizeTagFields(raw = {}) {
  const statusTags = new Set(['pending', 'processing', 'completed', 'failed']);
  const userTags = normalizeTags(raw.userTags !== undefined ? raw.userTags : raw.tags).filter((tag) => !statusTags.has(tag));
  const systemTags = normalizeTags(raw.systemTags || raw.analysis?.tags || []).filter((tag) => !statusTags.has(tag));
  return {
    userTags,
    systemTags,
    tags: mergeTags(userTags, systemTags),
  };
}

function hasAllTags(actualTags, requiredTags = []) {
  const actual = new Set(normalizeTags(actualTags));
  return normalizeTags(requiredTags).every((tag) => actual.has(tag));
}

function countTagMatches(actualTags, queryTags = []) {
  const actual = new Set(normalizeTags(actualTags));
  return normalizeTags(queryTags).filter((tag) => actual.has(tag)).length;
}

function inferSystemTagsFromAsset(asset = {}) {
  const tags = [];
  if (asset.mediaType) tags.push(asset.mediaType);
  if (asset.type) tags.push(asset.type);
  if (asset.assetType) tags.push(asset.assetType);
  if (asset.source) tags.push(asset.source);
  if (asset.analysis?.product?.category) tags.push(asset.analysis.product.category);
  return normalizeTags(tags);
}

module.exports = {
  normalizeTag,
  normalizeTags,
  mergeTags,
  normalizeTagFields,
  hasAllTags,
  countTagMatches,
  inferSystemTagsFromAsset,
};
