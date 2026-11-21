import { describe, expect, it, vi } from 'vitest';
import { createFallbackProvider } from '../services/llm/fallbackProvider.js';
import { LlmNotConfiguredError, LlmPermanentError, LlmTransientError } from '../services/llm/errors.js';

function fakeProvider(modelName, results, configured = true) {
  return {
    modelName,
    isConfigured: () => configured,
    complete: vi.fn(async () => {
      const next = results.shift();
      if (next instanceof Error) throw next;
      return next;
    }),
  };
}

const silent = { warn: () => {} };

describe('fallback provider', () => {
  it('uses the primary when it works', async () => {
    const primary = fakeProvider('p', ['from-primary']);
    const fallback = fakeProvider('f', ['from-fallback']);
    const llm = createFallbackProvider(primary, fallback, { logger: silent });
    await expect(llm.complete({})).resolves.toBe('from-primary');
    expect(fallback.complete).not.toHaveBeenCalled();
    expect(llm.modelName).toBe('p');
    expect(llm.fallbackModelName).toBe('f');
  });

  it.each([
    ['transient (timeout / 503)', new LlmTransientError('HTTP 503')],
    ['permanent (bad key / model gone)', new LlmPermanentError('HTTP 404')],
  ])('falls back on a %s error', async (_label, error) => {
    const primary = fakeProvider('p', [error]);
    const fallback = fakeProvider('f', ['from-fallback']);
    const llm = createFallbackProvider(primary, fallback, { logger: silent });
    await expect(llm.complete({})).resolves.toBe('from-fallback');
  });

  it('reports which provider is handling requests (for live progress)', async () => {
    const primary = fakeProvider('p', ['ok', new LlmTransientError('down')]);
    const fallback = fakeProvider('f', ['from-fallback']);
    const llm = createFallbackProvider(primary, fallback, { logger: silent });
    expect(llm.currentRoute()).toBeNull();
    await llm.complete({});
    expect(llm.currentRoute()).toEqual({ model: 'p', isFallback: false });
    await llm.complete({});
    expect(llm.currentRoute()).toEqual({ model: 'f', isFallback: true });
    expect(llm.providers().map((p) => p.role)).toEqual(['primary', 'fallback']);
  });

  it('skips the primary during the cooldown, then tries it again', async () => {
    let clock = 0;
    const primary = fakeProvider('p', [new LlmTransientError('down'), 'primary-back']);
    const fallback = fakeProvider('f', ['f1', 'f2']);
    const llm = createFallbackProvider(primary, fallback, { cooldownMs: 1000, now: () => clock, logger: silent });

    await llm.complete({});
    clock = 500;
    await expect(llm.complete({})).resolves.toBe('f2');
    expect(primary.complete).toHaveBeenCalledTimes(1);

    clock = 1500;
    await expect(llm.complete({})).resolves.toBe('primary-back');
  });

  it('propagates fallback errors when both fail', async () => {
    const primary = fakeProvider('p', [new LlmTransientError('p down')]);
    const fallback = fakeProvider('f', [new LlmTransientError('f down')]);
    const llm = createFallbackProvider(primary, fallback, { logger: silent });
    await expect(llm.complete({})).rejects.toThrow('f down');
  });

  it('does not swallow unexpected errors', async () => {
    const primary = fakeProvider('p', [new TypeError('bug')]);
    const fallback = fakeProvider('f', ['x']);
    const llm = createFallbackProvider(primary, fallback, { logger: silent });
    await expect(llm.complete({})).rejects.toBeInstanceOf(TypeError);
  });

  it('uses the fallback directly when the primary is not configured', async () => {
    const primary = fakeProvider('p', [], false);
    const fallback = fakeProvider('f', ['from-fallback']);
    const llm = createFallbackProvider(primary, fallback, { logger: silent });
    expect(llm.modelName).toBe('f');
    expect(llm.fallbackModelName).toBeNull();
    await expect(llm.complete({})).resolves.toBe('from-fallback');
  });

  it('is not configured when neither provider is', async () => {
    const llm = createFallbackProvider(fakeProvider('p', [], false), fakeProvider('f', [], false), { logger: silent });
    expect(llm.isConfigured()).toBe(false);
    await expect(llm.complete({})).rejects.toBeInstanceOf(LlmNotConfiguredError);
  });
});
