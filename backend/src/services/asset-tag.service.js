const tagAliases = new Map([
  ['AI生成', 'ai_generated'],
  ['ai生成', 'ai_generated'],
  ['AIGC', 'ai_generated'],
  ['商品展示', 'product_showcase'],
  ['电商短视频', 'commerce_short_video'],
  ['功能饮料', 'functional_drink'],
  ['提神饮品', 'energy_drink'],
  ['棚拍产品视频', 'studio_product_video'],
  ['TikTok Shop带货', 'tiktok_shop_selling'],
  ['tiktok shop带货', 'tiktok_shop_selling'],
  ['tiktok_shop带货', 'tiktok_shop_selling'],
  ['竖屏短平快素材', 'vertical_short_clip'],
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

const highValueWeights = new Map([
  ['functional_drink', 120],
  ['energy_drink', 116],
  ['product', 110],
  ['close_up', 106],
  ['detail', 104],
  ['usage', 102],
  ['demo', 100],
  ['action', 98],
  ['selling_point', 96],
  ['feature', 94],
  ['material', 92],
  ['hook', 90],
  ['comparison', 88],
  ['before_after', 86],
  ['studio_product_video', 82],
  ['brand', 80],
  ['logo', 78],
  ['end_card', 76],
  ['unboxing', 74],
  ['product_showcase', 35],
  ['tiktok_shop_selling', 32],
  ['commerce_short_video', 28],
  ['vertical_short_clip', 24],
]);

const lowValueTags = new Set([
  'ai',
  'ai_generated',
  'aigc',
  'generated',
  'mock',
  'mock_analysis',
  'mock-slice',
  'seedance',
  'seed_dance',
  'upload',
  'uploaded',
  'local',
  'image',
  'video',
  'reference',
  'other',
  'ai_generated_video',
  'product_showcase',
  'product_image',
  'product_video',
  'reference_image',
  'reference_video',
  'commerce_short_video',
]);

const MAX_TAGS = 10;

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
  return sortTagsByImportance([...new Set(splitTags(value).map(normalizeTag).filter(Boolean))]);
}

function mergeTags(...groups) {
  return normalizeTags(groups.flatMap((group) => splitTags(group)));
}

function tagScore(tag, index = 0) {
  const base = highValueWeights.get(tag) || (lowValueTags.has(tag) ? 0 : 50);
  const specificity = tag.length > 8 && !lowValueTags.has(tag) ? 6 : 0;
  return base + specificity - index * 0.01;
}

function sortTagsByImportance(tags = []) {
  return [...tags].sort((a, b) => tagScore(b, tags.indexOf(b)) - tagScore(a, tags.indexOf(a)));
}

function curateTags(tags = [], limit = MAX_TAGS) {
  const normalized = normalizeTags(tags);
  const important = normalized.filter((tag) => !lowValueTags.has(tag));
  const selected = (important.length ? important : normalized).slice(0, Math.max(0, Number(limit || MAX_TAGS)));
  return selected;
}

function normalizeTagFields(raw = {}) {
  const statusTags = new Set(['pending', 'processing', 'completed', 'failed']);
  const userTags = curateTags(raw.userTags !== undefined ? raw.userTags : raw.tags).filter((tag) => !statusTags.has(tag));
  const systemTags = curateTags(raw.systemTags || raw.analysis?.tags || []).filter((tag) => !statusTags.has(tag));
  return {
    userTags,
    systemTags,
    tags: curateTags(mergeTags(userTags, systemTags)),
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
  return curateTags(tags);
}

module.exports = {
  normalizeTag,
  normalizeTags,
  mergeTags,
  curateTags,
  sortTagsByImportance,
  normalizeTagFields,
  hasAllTags,
  countTagMatches,
  inferSystemTagsFromAsset,
};
