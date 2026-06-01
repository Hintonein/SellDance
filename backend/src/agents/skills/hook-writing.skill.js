function buildHookLine(productTitle, sellingPoint) {
  return `Stop scrolling. ${productTitle || 'This product'} makes ${sellingPoint || 'the key benefit'} instantly visible.`;
}

module.exports = { buildHookLine };
