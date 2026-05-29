import { request } from './http';
export const storyboardsApi = {
  getCurrent: (projectId) => request(`/projects/${projectId}/storyboard`),
  generate: (projectId, scriptText) => request(`/projects/${projectId}/storyboard/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scriptText }) }),
  save: (projectId, scenes) => request(`/projects/${projectId}/storyboard`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenes }) }),
  updateScene: (projectId, storyboardId, sceneId, payload) => request(`/projects/${projectId}/storyboards/${storyboardId}/scenes/${sceneId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
};
