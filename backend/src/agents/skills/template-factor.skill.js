function normalizeTemplateFactors(factors = []) {
  return (Array.isArray(factors) ? factors : [factors]).map((item) => String(item || '').trim()).filter(Boolean);
}

module.exports = { normalizeTemplateFactors };
