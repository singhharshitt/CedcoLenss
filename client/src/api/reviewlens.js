import { API_BASE, apiRequest, uploadFile } from './client.js';

/** Every backend endpoint the UI uses, in one place. */
export const api = {
  health: () => apiRequest('/api/health'),
  listDatasets: () => apiRequest('/api/datasets'),
  uploadDataset: (file, onProgress) => uploadFile('/api/datasets', file, { onProgress }),
  datasetStatus: (id) => apiRequest(`/api/datasets/${id}/status`),
  dashboard: (id) => apiRequest(`/api/datasets/${id}/dashboard`),
  reviews: (id, filters) => apiRequest(`/api/datasets/${id}/reviews?${toQuery(filters)}`),
  products: (id) => apiRequest(`/api/datasets/${id}/products`),
  product: (id, productId) => apiRequest(`/api/datasets/${id}/products/${productId}`),
  retryFailed: (id) => apiRequest(`/api/datasets/${id}/retry-failed`, { method: 'POST', body: {} }),
  generateReply: (reviewId, regenerate = false) =>
    apiRequest(`/api/reviews/${reviewId}/reply`, { method: 'POST', body: { regenerate }, timeoutMs: 120000 }),
};

export const SAMPLE_CSV_URL = `${API_BASE}/api/sample-csv`;

/** Builds a query string, skipping empty values. */
export function toQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  return search.toString();
}
