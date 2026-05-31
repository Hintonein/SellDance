import { request } from './http';
export const storyboardsApi = {
  getCurrent: (projectId) => request(`/projects/${projectId}/storyboard`),
  list: (projectId) => request(`/projects/${projectId}/storyboards`),
  get: (projectId, storyboardId) => request(`/projects/${projectId}/storyboards/${storyboardId}`),
  generate: (projectId, payload) => request(`/projects/${projectId}/storyboards/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(typeof payload === 'string' ? { scriptText: payload } : payload) }),
  save: (projectId, scenes) => request(`/projects/${projectId}/storyboard`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenes }) }),
  updateScene: (projectId, storyboardId, sceneId, payload) => request(`/projects/${projectId}/storyboards/${storyboardId}/scenes/${sceneId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  regenerateScene: (projectId, storyboardId, sceneId, payload) => request(`/projects/${projectId}/storyboards/${storyboardId}/scenes/${sceneId}/regenerate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
};
