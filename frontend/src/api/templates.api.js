import { request } from './http';
export const templatesApi = { list: () => request('/templates') };
