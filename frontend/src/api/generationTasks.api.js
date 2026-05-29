import { request } from './http';
export const generationTasksApi = {
  list: (projectId) => request(`/projects/${projectId}/video-tasks`),
  create: (projectId, options) => request(`/projects/${projectId}/video-tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options) }),
  retry: (taskId) => request(`/video-tasks/${taskId}/retry`, { method: 'POST' }),
};
