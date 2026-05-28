function generateScript({ productInfo, sellingPoints, audience, style }) {
  const points = (sellingPoints || []).filter(Boolean);
  const firstPoint = points[0] || 'great value';
  const secondPoint = points[1] || 'high-quality details';

  return {
    hook: `Stop scrolling - meet ${productInfo || 'our featured product'}!`,
    painPoint: `${audience || 'busy shoppers'} need a faster way to spot products that actually deliver ${firstPoint}.`,
    productIntroduction: `${productInfo || 'This product'} is built for social commerce demos with a ${style || 'energetic'} style.`,
    sellingPoints: points.length ? points : [firstPoint, secondPoint],
    cta: "Tap now and grab yours before today's deal is gone!",
    tone: style || 'energetic',
    suggestedDuration: 15,
    sceneOutline: [
      'Find reference: compare merchant assets and short-video examples.',
      'Extract method: open with pain, show proof, compress benefits.',
      'Produce script: hook, demo, benefits, and direct CTA.',
    ],
  };
}

function formatScriptText(script) {
  return [
    script.hook,
    script.painPoint,
    script.productIntroduction,
    ...(script.sellingPoints || []),
    script.cta,
    `Tone: ${script.tone}. Suggested duration: ${script.suggestedDuration}s.`,
  ].join(' ');
}

module.exports = {
  generateScript,
  formatScriptText,
};
