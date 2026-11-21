import { describe, expect, it, vi } from 'vitest';
import { computeBackoffDelay, parseRetryAfter } from '../utils/retry.js';
import { createOpenAiCompatibleProvider } from '../services/llm/openaiCompatibleProvider.js';
import { LlmNotConfiguredError, LlmPermanentError, LlmTransientError } from '../services/llm/errors.js';

const llmConfig = {
  apiKey: 'test-key',
  baseUrl: 'https://llm.example.test/v1',
  model: 'test-model',
  timeoutMs: 1000,
  maxRetries: 3,
  retryBaseDelayMs: 100,
  retryMaxDelayMs: 2000,
};

const okResponse = (content) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const errorResponse = (status, headers = {}) => new Response('error body', { status, headers });

/** Provider wired to a scripted fetch; sleeps are recorded instead of awaited. */
function setup(responses) {
  const delays = [];
  const fetchImpl = vi.fn(async () => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  });
  const provider = createOpenAiCompatibleProvider(llmConfig, {
    fetchImpl,
    sleep: async (ms) => delays.push(ms),
    random: () => 1, // deterministic jitter (upper bound)
  });
  return { provider, fetchImpl, delays };
}

describe('network / rate-limit retries', () => {
  it('retries 429 and 5xx with exponential backoff, then succeeds', async () => {
    const { provider, fetchImpl, delays } = setup([errorResponse(429), errorResponse(503), okResponse('{"ok":1}')]);
    const content = await provider.complete({ system: 's', user: 'u', json: true });
    expect(content).toBe('{"ok":1}');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([100, 200]); // base * 2^attempt
  });

  it('honours Retry-After when it is longer than the computed backoff', async () => {
    const { provider, delays } = setup([errorResponse(429, { 'retry-after': '1' }), okResponse('x')]);
    await provider.complete({ system: 's', user: 'u' });
    expect(delays).toEqual([1000]);
  });

  it('retries timeouts / connection errors', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const { provider, fetchImpl } = setup([timeout, new TypeError('fetch failed'), okResponse('x')]);
    await expect(provider.complete({ system: 's', user: 'u' })).resolves.toBe('x');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('gives up after maxRetries with a transient error (bounded)', async () => {
    const { provider, fetchImpl } = setup([500, 502, 503, 504].map((s) => errorResponse(s)));
    await expect(provider.complete({ system: 's', user: 'u' })).rejects.toBeInstanceOf(LlmTransientError);
    expect(fetchImpl).toHaveBeenCalledTimes(4); // 1 + 3 retries
  });

  it('does not retry permanent errors such as an invalid key', async () => {
    const { provider, fetchImpl } = setup([errorResponse(401)]);
    await expect(provider.complete({ system: 's', user: 'u' })).rejects.toBeInstanceOf(LlmPermanentError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('sends the key only in the Authorization header and uses JSON mode', async () => {
    const { provider, fetchImpl } = setup([okResponse('x')]);
    await provider.complete({ system: 'sys', user: 'usr', json: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://llm.example.test/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(init.body);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'usr' },
    ]);
  });

  it('ping: one request, no retries, reports latency or the provider error', async () => {
    const ok = setup([okResponse('OK')]);
    await expect(ok.provider.ping()).resolves.toMatchObject({ ok: true, error: null });
    expect(ok.provider.host).toBe('llm.example.test');

    const down = setup([errorResponse(503), okResponse('never reached')]);
    const result = await down.provider.ping();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('HTTP 503');
    expect(down.fetchImpl).toHaveBeenCalledTimes(1);

    const unconfigured = createOpenAiCompatibleProvider({ ...llmConfig, apiKey: '' });
    await expect(unconfigured.ping()).resolves.toMatchObject({ ok: false });
  });

  it('refuses to run without configuration', async () => {
    const provider = createOpenAiCompatibleProvider({ ...llmConfig, apiKey: '' });
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.complete({ system: 's', user: 'u' })).rejects.toBeInstanceOf(LlmNotConfiguredError);
  });
});

describe('backoff helpers', () => {
  it('caps the delay and applies jitter between 50% and 100%', () => {
    const opts = { baseDelayMs: 1000, maxDelayMs: 5000 };
    expect(computeBackoffDelay(0, { ...opts, random: () => 0 })).toBe(500);
    expect(computeBackoffDelay(10, { ...opts, random: () => 1 })).toBe(5000);
  });

  it('parses Retry-After seconds and HTTP dates', () => {
    expect(parseRetryAfter('3')).toBe(3000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(parseRetryAfter(null)).toBeNull();
  });
});
