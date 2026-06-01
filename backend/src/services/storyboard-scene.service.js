function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeSelectedAssetIds(input) {
  if (Array.isArray(input)) {
    return input.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (input === null || input === undefined) return [];
  const single = String(input).trim();
  return single ? [single] : [];
}

function normalizeScene(scene = {}, index = 0) {
  const sceneOrder = toPositiveNumber(scene.sceneOrder ?? scene.sceneNumber, index + 1);
  const durationSeconds = toPositiveNumber(scene.durationSeconds, 3);
  const scriptText = String(scene.scriptText ?? scene.narration ?? '').trim();
  const subtitleText = String(scene.subtitleText ?? scene.subtitle ?? scriptText).trim();
  const selectedAssetIds = normalizeSelectedAssetIds(scene.selectedAssetIds ?? scene.selectedAssetId);
  const layout = String(scene.layout || 'cover').trim() || 'cover';
  const transition = String(scene.transition || 'cut').trim() || 'cut';
  const cameraMotion = String(scene.cameraMotion || 'push-in').trim() || 'push-in';
  const visualDescription = String(scene.visualDescription || scene.scriptText || '').trim();
  const bgmHint = String(scene.bgmHint || scene.backgroundMusicPlaceholder || 'upbeat commerce bed').trim();

  return {
    sceneId: scene.sceneId || scene.id || `scene-${sceneOrder}`,
    sceneOrder,
    sceneIndex: sceneOrder,
    durationSeconds,
    duration: durationSeconds,
    scriptText,
    narration: scriptText,
    subtitleText,
    subtitle: subtitleText,
    visualDescription,
    cameraMotion,
    selectedAssetIds,
    assetRefs: selectedAssetIds,
    layout,
    transition,
    bgmHint,
    status: scene.status || 'ready',
  };
}

function normalizeScenes(scenes = []) {
  if (!Array.isArray(scenes)) return [];
  return scenes
    .map((scene, index) => normalizeScene(scene, index))
    .sort((a, b) => a.sceneOrder - b.sceneOrder)
    .map((scene, index) => ({ ...scene, sceneOrder: index + 1 }));
}

module.exports = {
  normalizeScene,
  normalizeScenes,
};
