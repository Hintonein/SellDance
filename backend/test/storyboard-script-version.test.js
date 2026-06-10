const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const { SCRIPTS_DIR, STORYBOARDS_DIR } = require('../src/config/paths');
const { writeScript } = require('../src/services/storage.service');
const { generateAndSaveStoryboard, saveStoryboard, updateScene } = require('../src/services/storyboard.service');

async function cleanup(projectId) {
  await fs.rm(path.join(SCRIPTS_DIR, `${projectId}.json`), { force: true });
  await fs.rm(path.join(STORYBOARDS_DIR, `${projectId}.json`), { force: true });
}

test('storyboard generation uses selected script version and marks stale after edits', async () => {
  const projectId = `test-storyboard-version-${Date.now()}`;
  await cleanup(projectId);

  await writeScript(projectId, {
    id: 'script_test',
    scriptId: 'script_test',
    projectId,
    selectedVersionId: 'version_1',
    scenes: [{ id: 'current_scene', sceneRole: 'hook', duration: 2, voiceover: 'Current script scene' }],
    versions: [
      {
        versionId: 'version_1',
        versionNumber: 1,
        scriptText: 'Version one',
        scenes: [{ id: 'v1_scene', sceneRole: 'hook', duration: 2, voiceover: 'Version one hook', subtitle: 'V1' }],
      },
      {
        versionId: 'version_2',
        versionNumber: 2,
        scriptText: 'Version two',
        scenes: [{ id: 'v2_scene', sceneRole: 'cta', duration: 2, voiceover: 'Version two CTA', subtitle: 'V2' }],
      },
    ],
  });

  const storyboard = await generateAndSaveStoryboard(projectId, {
    scriptId: 'script_test',
    scriptVersionId: 'version_2',
    createEditingPlan: true,
  });

  assert.equal(storyboard.scriptVersionId, 'version_2');
  assert.equal(storyboard.scriptVersionNumber, 2);
  assert.equal(storyboard.scenes.length, 1);
  assert.equal(storyboard.scenes[0].scriptSceneId, 'v2_scene');
  assert.equal(storyboard.scenes[0].voiceover, 'Version two CTA');
  assert.match(storyboard.scenes[0].generationPrompt, /Version two CTA/);

  const storyboardWithPlan = await saveStoryboard(projectId, {
    ...storyboard,
    editingPlanId: 'editing_plan_test',
    editingPlanStatus: 'ready',
  }, 'test-plan-ready');
  const edited = await updateScene(projectId, storyboardWithPlan.storyboardId, storyboardWithPlan.scenes[0].id, {
    visualDescription: 'Edited scene',
  });
  assert.equal(edited.editingPlanStatus, 'stale');

  await cleanup(projectId);
});
