const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const { STORYBOARDS_DIR } = require('../src/config/paths');
const {
  saveStoryboard,
  getStoryboard,
  reorderScenes,
  deleteScene,
} = require('../src/services/storyboard.service');

async function cleanup(projectId) {
  await fs.rm(path.join(STORYBOARDS_DIR, `${projectId}.json`), { force: true });
}

test('storyboard editor reorders and deletes scenes with stable ids', async () => {
  const projectId = `test-storyboard-editor-${Date.now()}`;
  await cleanup(projectId);

  const storyboard = await saveStoryboard(projectId, {
    id: 'storyboard_test',
    storyboardId: 'storyboard_test',
    scriptId: 'script_test',
    scenes: [
      { id: 'scene_a', sceneRole: 'hook', duration: 2, subtitle: 'A' },
      { id: 'scene_b', sceneRole: 'usage_demo', duration: 3, subtitle: 'B' },
      { id: 'scene_c', sceneRole: 'cta', duration: 2, subtitle: 'C' },
    ],
  }, 'test');

  assert.equal(storyboard.scenes[0].id, 'scene_a');

  const reordered = await reorderScenes(projectId, 'storyboard_test', ['scene_c', 'scene_a', 'scene_b']);
  assert.deepEqual(reordered.scenes.map((scene) => scene.id), ['scene_c', 'scene_a', 'scene_b']);
  assert.deepEqual(reordered.scenes.map((scene) => scene.order), [1, 2, 3]);
  assert.deepEqual(reordered.scenes.map((scene) => scene.sceneOrder), [1, 2, 3]);

  await assert.rejects(
    () => reorderScenes(projectId, 'storyboard_test', ['scene_c', 'scene_a']),
    /sceneIds must include every storyboard scene/,
  );
  await assert.rejects(
    () => reorderScenes(projectId, 'storyboard_test', ['scene_c', 'scene_a', 'scene_a']),
    /duplicates/,
  );
  await assert.rejects(
    () => reorderScenes(projectId, 'storyboard_test', ['scene_c', 'scene_a', 'missing_scene']),
    /unknown storyboard scene/,
  );

  const deleted = await deleteScene(projectId, 'storyboard_test', 'scene_a');
  assert.deepEqual(deleted.scenes.map((scene) => scene.id), ['scene_c', 'scene_b']);
  assert.deepEqual(deleted.scenes.map((scene) => scene.order), [1, 2]);

  const missing = await deleteScene(projectId, 'storyboard_test', 'missing_scene');
  assert.equal(missing, null);

  const persisted = await getStoryboard(projectId);
  assert.deepEqual(persisted.scenes.map((scene) => scene.id), ['scene_c', 'scene_b']);

  await cleanup(projectId);
});
