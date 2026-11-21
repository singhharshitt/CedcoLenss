/**
 * Thin fetch wrapper used by every API call.
 * - one base URL, resolved here only (see resolveApiBase)
 * - JSON parsing and the `{ data }` / `{ error }` envelope
 * - non-2xx responses and timeouts become ApiError with a readable, status-specific message
 */

/**
 * The API origin, from VITE_API_BASE_URL (baked in at build time by Vite).
 * - empty → same origin: the Vite dev proxy, the Docker nginx proxy, or Express serving the UI
 * - split deployment (e.g. Vercel + Render) → the backend origin, e.g. https://my-api.onrender.com
 * Every endpoint path already starts with /api, so a trailing slash or a trailing /api is
 * stripped to avoid requests like /api/api/datasets.
 */
export function resolveApiBase(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '');
}

export const API_BASE = resolveApiBase(import.meta.env.VITE_API_BASE_URL);

// A static host (Vercel, Netlify, …) has no /api of its own: without a base URL every call would 404.
if (import.meta.env.PROD && !API_BASE && typeof window !== 'undefined' && /\.(vercel\.app|netlify\.app|pages\.dev)$/.test(window.location.hostname)) {
  console.error('[ReviewLens] VITE_API_BASE_URL is not set for this build, so API requests go to this static host and fail. Set it to the backend URL and redeploy.');
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR', url = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.url = url;
  }
}

/** A readable message for an HTTP failure that did not come with our `{ error: { message } }` envelope. */
export function messageForStatus(status) {
  if (status === 400 || status === 422) return 'The request was invalid. Please check the input and try again.';
  if (status === 401) return 'You are not authorised to do this.';
  if (status === 403) return 'Access to this resource is forbidden.';
  if (status === 404) {
    return 'The requested API resource was not found (404). The app may be pointing at the wrong backend; check the API URL configuration.';
  }
  if (status === 413) return 'The file is too large.';
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status === 502 || status === 503 || status === 504) {
    return 'The backend is unavailable or still starting up. Please try again in a minute.';
  }
  if (status >= 500) return 'The server had a problem handling this request. Please try again.';
  return `Request failed with status ${status}.`;
}

/** Our API always answers with `{ error: { code, message } }`; anything else (an HTML/text 404 page) did not come from it. */
function errorFromResponse(status, payload, url) {
  if (import.meta.env.DEV) console.warn(`[ReviewLens] ${status} from ${url}`, payload?.error ?? '(not a ReviewLens API response)');
  return new ApiError(payload?.error?.message ?? messageForStatus(status), {
    status,
    code: payload?.error?.code ?? 'HTTP_ERROR',
    url,
  });
}

const unreachableMessage = () =>
  API_BASE
    ? `Cannot reach the ReviewLens API at ${API_BASE}. It may be starting up (try again in a minute), offline, or not allowing this site (CORS).`
    : 'Cannot reach the ReviewLens server. Is the backend running?';

/** A web page came back where JSON was expected: the request reached the frontend host, not the API. */
export const WRONG_HOST_MESSAGE =
  'The server returned a web page instead of API data, so this app is not connected to the ReviewLens API. ' +
  'Set VITE_API_BASE_URL to the backend URL and redeploy the frontend.';

async function parseEnvelope(response, url) {
  const isHtml = /text\/html/i.test(response.headers.get('content-type') ?? '');
  const payload = isHtml ? null : await response.json().catch(() => null);
  if (!response.ok) throw errorFromResponse(response.status, payload, url);
  if (isHtml) throw new ApiError(WRONG_HOST_MESSAGE, { status: response.status, code: 'WRONG_HOST', url });
  if (!payload || !('data' in payload)) throw new ApiError('Unexpected response from the server.', { status: response.status, url });
  return payload.data;
}

// Default 60 s: a sleeping free-tier backend (e.g. Render) can take ~30–50 s to wake up.
export async function apiRequest(path, { method = 'GET', body, timeoutMs = 60000, signal } = {}) {
  const url = `${API_BASE}${path}`;
  const signals = [AbortSignal.timeout(timeoutMs), signal].filter(Boolean);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
    });
  } catch (error) {
    if (error?.name === 'TimeoutError') throw new ApiError('The server took too long to respond.', { code: 'TIMEOUT', url });
    if (error?.name === 'AbortError') throw error;
    throw new ApiError(unreachableMessage(), { url });
  }
  return parseEnvelope(response, url);
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
    const url = `${API_BASE}${path}`;
    xhr.open('POST', url);
    xhr.timeout = 90000;
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
      reject(errorFromResponse(xhr.status, payload, url));
    };
    xhr.onerror = () => reject(new ApiError(unreachableMessage(), { url }));
    xhr.ontimeout = () => reject(new ApiError('The upload timed out.', { code: 'TIMEOUT', url }));
    xhr.send(form);
  });
}
