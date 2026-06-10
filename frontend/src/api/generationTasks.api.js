import { request, toQuery } from './http';
export const generationTasksApi = {
  list: (projectId, params = {}) => request(`/projects/${projectId}/generation-tasks${toQuery(params)}`),
  create: (projectId, options) => request(`/projects/${projectId}/generation-tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options) }),
  retry: (projectId, taskId) => request(`/projects/${projectId}/generation-tasks/${taskId}/retry`, { method: 'POST' }),
  remove: (projectId, taskId) => request(`/projects/${projectId}/generation-tasks/${taskId}`, { method: 'DELETE' }),
  restore: (projectId, taskId) => request(`/projects/${projectId}/generation-tasks/${taskId}/restore`, { method: 'POST' }),
  removePermanent: (projectId, taskId) => request(`/projects/${projectId}/generation-tasks/${taskId}/permanent`, { method: 'DELETE' }),
};
