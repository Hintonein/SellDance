import { request } from './http';
export const projectsApi = {
  list: () => request('/projects'),
  create: (payload) => request('/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  update: (projectId, payload) => request(`/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  archive: (projectId) => request(`/projects/${projectId}`, { method: 'DELETE' }),
};
