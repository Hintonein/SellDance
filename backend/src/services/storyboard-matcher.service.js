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
      sceneNumber: index + 1,
      narration: line,
      subtitle: line,
      voiceoverPlaceholder: `voiceover_scene_${index + 1}.wav`,
      backgroundMusicPlaceholder: 'bgm_track_placeholder.mp3',
      selectedAssetId: material ? material.id : null,
      selectedAssetName: material ? material.originalName : 'No asset matched',
      durationSeconds: 3,
    };
  });
}

module.exports = {
  buildStoryboard,
};
