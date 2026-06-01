import { request, toQuery } from './http';
export const assetsApi = {
  listGlobal: (params = {}) => request(`/assets${toQuery(params)}`),
  getGlobal: (assetId) => request(`/assets/${assetId}`),
  getGlobalSlices: (assetId) => request(`/assets/${assetId}/slices`),
  removeGlobal: (assetId) => request(`/assets/${assetId}`, { method: 'DELETE' }),
  list: (projectId, params = {}) => request(`/projects/${projectId}/assets${toQuery(params)}`),
  get: (projectId, assetId) => request(`/projects/${projectId}/assets/${assetId}`),
  upload: async (projectId, { file, title, type, source, tags, metadata, description }) => {
    const formData = new FormData();
    formData.append('file', file);
    if (title) formData.append('title', title);
    if (type) formData.append('type', type);
    if (source) formData.append('source', source);
    if (tags) formData.append('tags', Array.isArray(tags) ? tags.join(',') : tags);
    if (description) formData.append('description', description);
    if (metadata) formData.append('metadata', typeof metadata === 'string' ? metadata : JSON.stringify(metadata));
    return request(`/projects/${projectId}/assets`, { method: 'POST', body: formData });
  },
  update: (projectId, assetId, payload) => request(`/projects/${projectId}/assets/${assetId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  remove: (projectId, assetId, options = {}) => request(`/projects/${projectId}/assets/${assetId}${options.deleteGlobal ? '?deleteGlobal=true' : ''}`, { method: 'DELETE' }),
  link: (projectId, assetId, payload = {}) => request(`/projects/${projectId}/assets/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, assetId }) }),
  unlink: (projectId, assetId) => request(`/projects/${projectId}/assets/${assetId}/link`, { method: 'DELETE' }),
  search: (projectId, payload) => request(`/projects/${projectId}/assets/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  recall: (projectId, payload) => request(`/projects/${projectId}/assets/recall`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  analyze: (projectId, assetId) => request(`/projects/${projectId}/assets/${assetId}/analyze`, { method: 'POST' }),
  getSlices: (projectId, assetId) => request(`/projects/${projectId}/assets/${assetId}/slices`),
  getSlice: (projectId, assetId, sliceId) => request(`/projects/${projectId}/assets/${assetId}/slices/${sliceId}`),
  updateSlice: (projectId, assetId, sliceId, payload) => request(`/projects/${projectId}/assets/${assetId}/slices/${sliceId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  deleteSlice: (projectId, assetId, sliceId) => request(`/projects/${projectId}/assets/${assetId}/slices/${sliceId}`, { method: 'DELETE' }),
};
