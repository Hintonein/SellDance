function generateScript({ productInfo, sellingPoints, audience, style }) {
  const points = (sellingPoints || []).filter(Boolean);
  const firstPoint = points[0] || 'great value';
  const secondPoint = points[1] || 'high-quality details';

  return [
    `Stop scrolling — meet ${productInfo || 'our featured product'}!`,
    `Designed for ${audience || 'busy shoppers'} who need ${firstPoint}.`,
    `You will love the ${secondPoint} from the first use.`,
    `Tap now and grab yours before today\'s deal is gone!`,
    `Style: ${style || 'energetic'}.`,
  ].join(' ');
}

module.exports = {
  generateScript,
};
