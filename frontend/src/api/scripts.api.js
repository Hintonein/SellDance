import { request } from './http';
export const scriptsApi = {
  getCurrent: (projectId) => request(`/projects/${projectId}/script`),
  list: (projectId) => request(`/projects/${projectId}/scripts`),
  generate: (projectId, payload) => request(`/projects/${projectId}/script/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  save: (projectId, scriptText) => request(`/projects/${projectId}/script`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scriptText }) }),
  refine: (projectId, scriptId, prompt) => request(`/projects/${projectId}/scripts/${scriptId}/refine`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) }),
};
