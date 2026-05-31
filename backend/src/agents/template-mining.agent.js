const modelProvider = require('../services/model-provider.service');
const { mineTemplate } = require('../services/template.service');

async function runTemplateMiningAgent(input = {}, options = {}) {
  if (options.persist === false) return modelProvider.mineCreativeTemplate(input, options);
  return mineTemplate(input);
}

module.exports = { runTemplateMiningAgent };
