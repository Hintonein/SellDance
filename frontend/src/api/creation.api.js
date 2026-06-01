import { request } from './http';
export const creationApi = {
  createPlan: (projectId, payload) => request(`/projects/${projectId}/creation/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  render: (projectId, payload) => request(`/projects/${projectId}/creation/render`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  listTasks: (projectId) => request(`/projects/${projectId}/creation/tasks`),
  getTask: (projectId, taskId) => request(`/projects/${projectId}/creation/tasks/${taskId}`),
  retryTask: (projectId, taskId) => request(`/projects/${projectId}/creation/tasks/${taskId}/retry`, { method: 'POST' }),
  cancelTask: (projectId, taskId) => request(`/projects/${projectId}/creation/tasks/${taskId}/cancel`, { method: 'POST' }),
  listOutputs: (projectId) => request(`/projects/${projectId}/creation/outputs`),
};
