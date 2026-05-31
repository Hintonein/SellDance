function buildProductBrief(input = {}) {
  return {
    title: input.productTitle || input.productInfo?.title || input.productInfo || 'Featured product',
    category: input.category || input.productCategory || input.productInfo?.category || 'general',
    sellingPoints: Array.isArray(input.sellingPoints) ? input.sellingPoints : [],
    targetAudience: input.targetAudience || input.audience || '',
  };
}

module.exports = { buildProductBrief };
