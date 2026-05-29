export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export function toQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else search.set(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, options);
  } catch (error) {
    throw new Error(`Cannot reach backend API at ${API_BASE_URL}. Please confirm npm run dev:backend is running. Detail: ${error.message}`, { cause: error });
  }
  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const payload = await response.json();
      message = payload.message || message;
      if (payload.route || payload.requestId) message = `${message}${payload.route ? ` | route: ${payload.route}` : ''}${payload.requestId ? ` | requestId: ${payload.requestId}` : ''}`;
    } catch { /* no-op */ }
    throw new Error(message);
  }
  return response.json();
}
