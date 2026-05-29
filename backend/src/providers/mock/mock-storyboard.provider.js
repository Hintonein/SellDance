const { buildStoryboard } = require('../../services/storyboard-matcher.service');
module.exports = { generateStoryboard: async (input) => ({ scenes: buildStoryboard(input.scriptText || '', input.assets || []) }) };
