/**
 * Thin fetch wrapper used by every API call.
 * - one base URL (same origin by default; Vite proxies /api in development)
 * - JSON parsing and the `{ data }` / `{ error }` envelope
 * - non-2xx responses and timeouts become ApiError with a readable message
 */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function parseEnvelope(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(payload?.error?.message ?? `Request failed with status ${response.status}`, {
      status: response.status,
      code: payload?.error?.code ?? 'HTTP_ERROR',
    });
  }
  if (!payload || !('data' in payload)) throw new ApiError('Unexpected response from the server.', { status: response.status });
  return payload.data;
}

export async function apiRequest(path, { method = 'GET', body, timeoutMs = 20000, signal } = {}) {
  const signals = [AbortSignal.timeout(timeoutMs), signal].filter(Boolean);
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
    });
  } catch (error) {
    if (error?.name === 'TimeoutError') throw new ApiError('The server took too long to respond.', { code: 'TIMEOUT' });
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('Cannot reach the ReviewLens server. Is the backend running?');
  }
  return parseEnvelope(response);
}

/**
 * Multipart upload via XMLHttpRequest, because fetch cannot report upload progress.
 * onProgress receives a number 0-100.
 */
export function uploadFile(path, file, { onProgress = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('file', file);
    xhr.open('POST', `${API_BASE}${path}`);
    xhr.timeout = 60000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      let payload = null;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        /* handled below */
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload?.data) return resolve(payload.data);
      reject(
        new ApiError(payload?.error?.message ?? `Upload failed with status ${xhr.status}`, {
          status: xhr.status,
          code: payload?.error?.code ?? 'HTTP_ERROR',
        }),
      );
    };
    xhr.onerror = () => reject(new ApiError('Cannot reach the ReviewLens server. Is the backend running?'));
    xhr.ontimeout = () => reject(new ApiError('The upload timed out.', { code: 'TIMEOUT' }));
    xhr.send(form);
  });
}
