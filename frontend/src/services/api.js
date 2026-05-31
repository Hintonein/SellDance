import { projectsApi } from '../api/projects.api';
import { assetsApi } from '../api/assets.api';
import { materialsApi } from '../api/materials.compat.api';
import { scriptsApi } from '../api/scripts.api';
import { storyboardsApi } from '../api/storyboards.api';
import { creationApi } from '../api/creation.api';
import { generationTasksApi } from '../api/generationTasks.api';
import { request } from '../api/http';

export { assetsApi, materialsApi, creationApi, generationTasksApi };

export const api = {
  listProjects: projectsApi.list,
  createProject: projectsApi.create,
  updateProject: projectsApi.update,
  archiveProject: projectsApi.archive,
  listAssets: assetsApi.list,
  getAsset: assetsApi.get,
  uploadAsset: assetsApi.upload,
  updateAsset: assetsApi.update,
  deleteAsset: assetsApi.remove,
  searchAssets: assetsApi.search,
  recallAssets: assetsApi.recall,
  analyzeAsset: assetsApi.analyze,
  getAssetSlices: assetsApi.getSlices,
  listMaterials: materialsApi.list,
  uploadMaterial: assetsApi.upload,
  generateAsset: (projectId, payload) => request(`/projects/${projectId}/assets/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  getAssetGenerationTask: (projectId, taskId) => request(`/projects/${projectId}/assets/generation-tasks/${taskId}`),
  reanalyzeAsset: assetsApi.analyze,
  getScript: scriptsApi.getCurrent,
  listScripts: scriptsApi.list,
  generateScript: scriptsApi.generate,
  saveScript: scriptsApi.save,
  refineScript: scriptsApi.refine,
  regenerateScript: scriptsApi.regenerate,
  regenerateScriptScene: scriptsApi.regenerateScene,
  getStoryboard: storyboardsApi.getCurrent,
  generateStoryboard: storyboardsApi.generate,
  saveStoryboard: storyboardsApi.save,
  updateStoryboardScene: storyboardsApi.updateScene,
  regenerateStoryboardScene: storyboardsApi.regenerateScene,
  createEditingPlan: creationApi.createPlan,
  renderCreation: creationApi.render,
  listCreationTasks: creationApi.listTasks,
  getCreationTask: creationApi.getTask,
  retryCreationTask: creationApi.retryTask,
  cancelCreationTask: creationApi.cancelTask,
  listTasks: generationTasksApi.list,
  createTask: generationTasksApi.create,
  retryTask: generationTasksApi.retry,
};
