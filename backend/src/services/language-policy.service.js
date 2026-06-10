function countCjk(text = '') {
  return (String(text).match(/[\u3400-\u9fff]/g) || []).length;
}

function countLatin(text = '') {
  return (String(text).match(/[A-Za-z]/g) || []).length;
}

function normalizeExplicitLanguage(value) {
  const text = String(value || '').trim().toLowerCase();
  if (['zh', 'zh-cn', 'cn', 'chinese', 'simplified_chinese'].includes(text)) return 'zh-CN';
  if (['en', 'en-us', 'english'].includes(text)) return 'en';
  return null;
}

function collectLanguageText(input = {}) {
  const productInfo = input.productInfo && typeof input.productInfo === 'object' ? input.productInfo : {};
  return [
    input.productName,
    input.productTitle,
    input.productInfo,
    input.description,
    input.productCategory,
    input.targetAudience,
    input.audience,
    input.style,
    productInfo.title,
    productInfo.name,
    productInfo.description,
    productInfo.category,
    productInfo.targetAudience,
    productInfo.scene,
    productInfo.brandTone,
    productInfo.sellingPoints,
    input.sellingPoints,
    input.scenes,
  ].map((item) => {
    if (!item) return '';
    if (typeof item === 'string') return item;
    return JSON.stringify(item);
  }).join('\n');
}

function resolveDialogueLanguage(input = {}, explicitLanguage = input.language || input.dialogueLanguage) {
  const explicit = normalizeExplicitLanguage(explicitLanguage);
  if (explicit) {
    return {
      dialogueLanguage: explicit,
      languageReason: `Explicit language override: ${explicit}`,
      languageInstruction: languageInstruction(explicit),
    };
  }

  const text = collectLanguageText(input);
  const cjk = countCjk(text);
  const latin = countLatin(text);
  const dialogueLanguage = cjk > 0 && cjk >= Math.max(2, Math.round(latin * 0.15)) ? 'zh-CN' : 'en';
  return {
    dialogueLanguage,
    languageReason: dialogueLanguage === 'zh-CN'
      ? 'Detected Chinese product information or selling points.'
      : 'Detected primarily English or non-Chinese product information.',
    languageInstruction: languageInstruction(dialogueLanguage),
  };
}

function languageInstruction(dialogueLanguage = 'en') {
  if (dialogueLanguage === 'zh-CN') {
    return [
      'Target spoken dialogue language: zh-CN.',
      'All voiceover and subtitle sentences must be natural Simplified Chinese.',
      'Do not mix Chinese and English inside dialogue or subtitles, except preserving exact brand/product names, model numbers, or platform names.',
      'If source product information is Chinese, keep the generated commerce speech Chinese.',
    ].join(' ');
  }
  return [
    'Target spoken dialogue language: en.',
    'All voiceover and subtitle sentences must be natural English.',
    'Do not mix Chinese and English inside dialogue or subtitles, except preserving exact brand/product names, model numbers, or platform names.',
  ].join(' ');
}

module.exports = {
  countCjk,
  countLatin,
  resolveDialogueLanguage,
  languageInstruction,
};
