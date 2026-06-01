module.exports = {
  mock: {
    analysis: require('./mock/mock-analysis.provider'),
    script: require('./mock/mock-script.provider'),
    storyboard: require('./mock/mock-storyboard.provider'),
    video: require('./mock/mock-video.provider'),
    image: require('./mock/mock-image.provider'),
  },
  volcengine: {
    ark: require('./volcengine/ark.client'),
    seed2: require('./volcengine/seed2.client'),
    seedance: require('./volcengine/seedance.client'),
    seedream: require('./volcengine/seedream.client'),
  },
};
