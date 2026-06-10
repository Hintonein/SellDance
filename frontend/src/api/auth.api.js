import { request } from './http';

export const authApi = {
  status: () => request('/auth/status'),
  login: (arkApiKey) => request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arkApiKey }),
  }),
};
