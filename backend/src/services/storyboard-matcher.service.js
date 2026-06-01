function buildStoryboard(scriptText, materials = []) {
  const sentences = (scriptText || '')
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (sentences.length === 0) {
    return [];
  }

  return sentences.map((line, index) => {
    const material = materials[index % (materials.length || 1)] || null;
    return {
      sceneId: `scene-${index + 1}`,
      sceneOrder: index + 1,
      sceneIndex: index + 1,
      scriptText: line,
      narration: line,
      subtitleText: line,
      subtitle: line,
      visualDescription: `Show ${line.slice(0, 80)} with product-focused framing and clear commerce labels.`,
      cameraMotion: index === 0 ? 'quick push-in' : 'smooth pan',
      voiceoverPlaceholder: `voiceover_scene_${index + 1}.wav`,
      backgroundMusicPlaceholder: 'bgm_track_placeholder.mp3',
      selectedAssetIds: material ? [material.id] : [],
      assetRefs: material ? [material.id] : [],
      selectedAssetName: material ? material.originalName : 'No asset matched',
      durationSeconds: 3,
      duration: 3,
      layout: 'cover',
      transition: 'cut',
      bgmHint: 'upbeat commerce bed',
      status: 'ready',
    };
  });
}

module.exports = {
  buildStoryboard,
};
