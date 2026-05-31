function storyboardPromptForScene(scene = {}) {
  return `Plan a ${scene.sceneRole || 'selling_point'} shot for: ${scene.visualDescription || scene.voiceover || scene.subtitle || ''}`;
}

module.exports = { storyboardPromptForScene };
