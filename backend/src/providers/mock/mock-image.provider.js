module.exports = { generateImage: async () => { const error = new Error('AI image generation is disabled.'); error.statusCode = 501; throw error; } };
