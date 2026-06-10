import { request } from './http';

export const scriptWorkflowTasksApi = {
  list: (projectId) => request(`/projects/${projectId}/script-workflow-tasks`),
  create: (projectId, payload) => request(`/projects/${projectId}/script-workflow-tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  get: (projectId, taskId) => request(`/projects/${projectId}/script-workflow-tasks/${taskId}`),
};
