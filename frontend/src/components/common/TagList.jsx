const TAG_LIMIT = 10;

const aliases = new Map([
  ['商品', 'product'],
  ['产品', 'product'],
  ['特写', 'close_up'],
  ['近景', 'close_up'],
  ['细节', 'detail'],
  ['详情', 'detail'],
  ['使用', 'usage'],
  ['演示', 'demo'],
  ['对比', 'comparison'],
  ['比较', 'comparison'],
  ['ai生成', 'ai_generated'],
  ['ai_生成', 'ai_generated'],
  ['aigc', 'ai_generated'],
]);

const highValueWeights = new Map([
  ['usage', 92],
  ['demo', 90],
  ['action', 88],
  ['selling_point', 86],
  ['feature', 84],
  ['material', 82],
  ['hook', 80],
  ['comparison', 78],
  ['before_after', 76],
  ['brand', 74],
  ['logo', 72],
  ['end_card', 70],
  ['scene', 68],
  ['lifestyle', 66],
  ['unboxing', 64],
  ['packshot', 62],
]);

const lowValueTags = new Set([
  'ai',
  'ai_generated',
  'aigc',
  'generated',
  'mock',
  'seedance',
  'seed_dance',
  'upload',
  'uploaded',
  'local',
  'image',
  'video',
  'reference',
  'other',
  'product_image',
  'product_video',
  'reference_image',
  'reference_video',
  'ai_generated_video',
  'product',
  'close_up',
  'detail',
  'studio_shot',
  'product_close_up',
  'product_detail',
  'productclose_updetailstudio_shot',
]);

function splitTags(tags) {
  if (Array.isArray(tags)) return tags;
  if (!tags) return [];
  return String(tags).split(/[,，]/);
}

function tagKey(tag) {
  const raw = String(tag || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase().replace(/\s+/g, '_');
  return aliases.get(raw) || aliases.get(lower) || lower;
}

function displayTag(tag) {
  return String(tag || '').trim().replace(/\s+/g, ' ');
}

function scoreTag(key, originalIndex) {
  const base = highValueWeights.get(key) || 30;
  const penalty = isLowValueTag(key) ? 40 : 0;
  const specificBonus = key.length > 3 && !isLowValueTag(key) ? 4 : 0;
  return base + specificBonus - penalty - originalIndex * 0.01;
}

function isLowValueTag(key) {
  return lowValueTags.has(key) || key.includes('productclose_updetail');
}

function curateTags(tags = [], limit = TAG_LIMIT) {
  const seen = new Set();
  const normalized = splitTags(tags)
    .map((tag, index) => {
      const key = tagKey(tag);
      return key ? { key, label: displayTag(tag), index, score: scoreTag(key, index) } : null;
    })
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item.key)) return false;
      seen.add(item.key);
      return true;
    });

  const important = normalized
    .filter((item) => !isLowValueTag(item.key))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit);

  return important.map((item) => item.label);
}

export default function TagList({ tags = [], limit = TAG_LIMIT, className = '' }) {
  const visible = curateTags(tags, Math.min(limit || TAG_LIMIT, TAG_LIMIT));

  if (!visible.length) return null;

  return (
    <div className={`tag-list ${className}`.trim()} aria-label="Asset tags">
      {visible.map((tag) => (
        <span className="tag-chip" key={tag} title={tag}>
          {tag}
        </span>
      ))}
    </div>
  );
}
