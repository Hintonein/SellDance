import { assetsApi } from './assets.api';
export const materialsApi = {
  list: async (projectId, params = {}) => {
    const result = await assetsApi.list(projectId, params);
    return Array.isArray(result) ? result : result.items || [];
  },
  get: assetsApi.get,
  upload: assetsApi.upload,
  update: assetsApi.update,
  remove: assetsApi.remove,
  search: assetsApi.search,
  analyze: assetsApi.analyze,
  getSlices: assetsApi.getSlices,
};
