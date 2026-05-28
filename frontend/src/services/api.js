const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const payload = await response.json();
      message = payload.message || message;
    } catch {
      // no-op
    }
    throw new Error(message);
  }
  return response.json();
}

export const api = {
  listProjects: () => request('/projects'),
  createProject: (payload) =>
    request('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  updateProject: (projectId, payload) =>
    request(`/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  archiveProject: (projectId) =>
    request(`/projects/${projectId}`, {
      method: 'DELETE',
    }),
  listMaterials: (projectId) => request(`/projects/${projectId}/materials`),
  uploadMaterial: async (projectId, { file, type }) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    return request(`/projects/${projectId}/materials`, {
      method: 'POST',
      body: formData,
    });
  },
  getScript: (projectId) => request(`/projects/${projectId}/script`),
  listScripts: (projectId) => request(`/projects/${projectId}/scripts`),
  generateScript: (projectId, payload) =>
    request(`/projects/${projectId}/script/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  saveScript: (projectId, scriptText) =>
    request(`/projects/${projectId}/script`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptText }),
    }),
  refineScript: (projectId, scriptId, prompt) =>
    request(`/projects/${projectId}/scripts/${scriptId}/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    }),
  getStoryboard: (projectId) => request(`/projects/${projectId}/storyboard`),
  generateStoryboard: (projectId, scriptText) =>
    request(`/projects/${projectId}/storyboard/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptText }),
    }),
  saveStoryboard: (projectId, scenes) =>
    request(`/projects/${projectId}/storyboard`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenes }),
    }),
  updateStoryboardScene: (projectId, storyboardId, sceneId, payload) =>
    request(`/projects/${projectId}/storyboards/${storyboardId}/scenes/${sceneId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  listTasks: (projectId) => request(`/projects/${projectId}/video-tasks`),
  createTask: (projectId, options) =>
    request(`/projects/${projectId}/video-tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    }),
  retryTask: (taskId) =>
    request(`/video-tasks/${taskId}/retry`, {
      method: 'POST',
    }),
};
