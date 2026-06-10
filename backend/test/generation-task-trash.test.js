const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');

const { OUTPUTS_DIR } = require('../src/config/paths');
const { writeTask, deleteTask } = require('../src/services/storage.service');
const videoTask = require('../src/services/video-task.service');

async function cleanup(taskId, projectId) {
  await deleteTask(taskId).catch(() => null);
  await fs.rm(path.join(OUTPUTS_DIR, projectId, `${taskId}.mp4`), { force: true });
  await fs.rm(path.join(OUTPUTS_DIR, projectId, `${taskId}.vtt`), { force: true });
}

test('generation task trash flow soft deletes, restores, and permanently removes outputs', async () => {
  const suffix = Date.now();
  const projectId = `trash-project-${suffix}`;
  const taskId = `trash_task_${suffix}`;
  const outputDir = path.join(OUTPUTS_DIR, projectId);
  const videoPath = path.join(outputDir, `${taskId}.mp4`);
  const captionPath = path.join(outputDir, `${taskId}.vtt`);
  await cleanup(taskId, projectId);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(videoPath, 'fake video');
  await fs.writeFile(captionPath, 'fake captions');

  await writeTask(taskId, {
    id: taskId,
    projectId,
    status: 'completed',
    progress: 100,
    currentStep: 'exporting',
    videoUrl: `/outputs/${projectId}/${taskId}.mp4`,
    captionUrl: `/outputs/${projectId}/${taskId}.vtt`,
    exportFile: `outputs/${projectId}/${taskId}.mp4`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  try {
    assert.equal((await videoTask.listTasks(projectId)).length, 1);
    assert.equal((await videoTask.listTasks(projectId, { deletedOnly: true })).length, 0);

    const trashed = await videoTask.moveTaskToTrash(projectId, taskId);
    assert.equal(trashed.deletedBy, 'user');
    assert.ok(trashed.deletedAt);
    assert.equal((await videoTask.listTasks(projectId)).length, 0);
    assert.equal((await videoTask.listTasks(projectId, { deletedOnly: true })).length, 1);
    await fs.access(videoPath);

    const restored = await videoTask.restoreTask(projectId, taskId);
    assert.equal(restored.deletedAt, null);
    assert.equal((await videoTask.listTasks(projectId)).length, 1);

    await videoTask.moveTaskToTrash(projectId, taskId);
    const permanent = await videoTask.permanentlyDeleteTask(projectId, taskId);
    assert.equal(permanent.success, true);
    assert.equal(permanent.deletedId, taskId);
    assert.equal(await videoTask.getTask(taskId), null);
    await assert.rejects(() => fs.access(videoPath), /ENOENT/);
    await assert.rejects(() => fs.access(captionPath), /ENOENT/);
  } finally {
    await cleanup(taskId, projectId);
  }
});

test('running generation task cannot be moved to trash', async () => {
  const suffix = Date.now();
  const projectId = `trash-running-project-${suffix}`;
  const taskId = `trash_running_task_${suffix}`;
  await cleanup(taskId, projectId);
  await writeTask(taskId, {
    id: taskId,
    projectId,
    status: 'rendering',
    progress: 50,
    currentStep: 'rendering video',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  try {
    await assert.rejects(
      () => videoTask.moveTaskToTrash(projectId, taskId),
      /Only completed, failed, or canceled/,
    );
  } finally {
    await cleanup(taskId, projectId);
  }
});
