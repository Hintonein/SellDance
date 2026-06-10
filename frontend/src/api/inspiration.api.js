import { request, toQuery } from './http';

export const inspirationApi = {
  searchVideos: (projectId, payload) => request(`/projects/${projectId}/inspiration-videos/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  listVideos: (projectId, params = {}) => request(`/projects/${projectId}/inspiration-videos${toQuery(params)}`),
  clearVideos: (projectId) => request(`/projects/${projectId}/inspiration-videos`, { method: 'DELETE' }),
  getVideo: (projectId, videoId) => request(`/projects/${projectId}/inspiration-videos/${videoId}`),
  analyzeVideo: (projectId, videoId, payload = {}) => request(`/projects/${projectId}/inspiration-videos/${videoId}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  listTemplates: (projectId, params = {}) => request(`/projects/${projectId}/inspiration-templates${toQuery(params)}`),
  generateTemplate: (projectId, payload) => request(`/projects/${projectId}/inspiration-templates/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  deleteTemplate: (projectId, templateId) => request(`/projects/${projectId}/inspiration-templates/${templateId}`, {
    method: 'DELETE',
  }),
  analyzeAndTemplate: (projectId, payload) => request(`/projects/${projectId}/inspiration-videos/analyze-and-template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  listWorkflowTasks: (projectId) => request(`/projects/${projectId}/inspiration-workflow-tasks`),
  getWorkflowTask: (projectId, taskId) => request(`/projects/${projectId}/inspiration-workflow-tasks/${taskId}`),
  listCrawlerTasks: (projectId) => request(`/projects/${projectId}/crawler-tasks`),
  getCrawlerTask: (projectId, taskId) => request(`/projects/${projectId}/crawler-tasks/${taskId}`),
  cancelCrawlerTask: (projectId, taskId) => request(`/projects/${projectId}/crawler-tasks/${taskId}/cancel`, { method: 'POST' }),
};
