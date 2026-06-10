import { request } from './http';
export const scriptsApi = {
  getCurrent: (projectId) => request(`/projects/${projectId}/script`),
  list: (projectId) => request(`/projects/${projectId}/scripts`),
  get: (projectId, scriptId) => request(`/projects/${projectId}/scripts/${scriptId}`),
  generate: (projectId, payload) => request(`/projects/${projectId}/scripts/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  save: (projectId, script) => {
    const scriptId = script?.id || script?.scriptId;
    if (scriptId) {
      return request(`/projects/${projectId}/scripts/${scriptId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(script) });
    }
    return request(`/projects/${projectId}/script`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(typeof script === 'string' ? { scriptText: script } : script) });
  },
  refine: (projectId, scriptId, prompt) => request(`/projects/${projectId}/scripts/${scriptId}/refine`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) }),
  regenerate: (projectId, scriptId, payload) => request(`/projects/${projectId}/scripts/${scriptId}/regenerate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  regenerateScene: (projectId, scriptId, sceneId, payload) => request(`/projects/${projectId}/scripts/${scriptId}/scenes/${sceneId}/regenerate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  deleteVersion: (projectId, scriptId, versionId) => request(`/projects/${projectId}/scripts/${scriptId}/versions/${versionId}`, { method: 'DELETE' }),
};
