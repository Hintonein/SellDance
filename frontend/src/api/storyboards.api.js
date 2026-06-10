import { request } from './http';
export const storyboardsApi = {
  getCurrent: (projectId) => request(`/projects/${projectId}/storyboard`),
  list: (projectId) => request(`/projects/${projectId}/storyboards`),
  get: (projectId, storyboardId) => request(`/projects/${projectId}/storyboards/${storyboardId}`),
  generate: (projectId, payload) => request(`/projects/${projectId}/storyboards/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(typeof payload === 'string' ? { scriptText: payload } : payload) }),
  save: (projectId, scenes) => request(`/projects/${projectId}/storyboard`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenes }) }),
  updateScene: (projectId, storyboardId, sceneId, payload) => request(`/projects/${projectId}/storyboards/${storyboardId}/scenes/${sceneId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  reorderScenes: (projectId, storyboardId, sceneIds) => request(`/projects/${projectId}/storyboards/${storyboardId}/scenes/reorder`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sceneIds }) }),
  deleteScene: (projectId, storyboardId, sceneId) => request(`/projects/${projectId}/storyboards/${storyboardId}/scenes/${sceneId}`, { method: 'DELETE' }),
  regenerateScene: (projectId, storyboardId, sceneId, payload) => request(`/projects/${projectId}/storyboards/${storyboardId}/scenes/${sceneId}/regenerate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  remove: (projectId, storyboardId) => request(`/projects/${projectId}/storyboards/${storyboardId}`, { method: 'DELETE' }),
};
