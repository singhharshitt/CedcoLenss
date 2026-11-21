import { LlmNotConfiguredError, LlmPermanentError, LlmTransientError } from './errors.js';

/**
 * Wraps a primary and a fallback provider behind the same interface
 * (isConfigured, modelName, complete).
 *
 * - The primary is tried first. If it fails with a transient error (timeout,
 *   429, 5xx after its own retries) or a permanent one (bad key, model gone),
 *   the same request is sent to the fallback.
 * - After a primary failure the primary is skipped for `cooldownMs`, so a
 *   provider outage does not add a timeout to every following batch.
 * - If the primary is not configured at all, the fallback is used directly.
 *
 * `modelName` stays the primary's name so cache keys remain stable.
 */
export function createFallbackProvider(primary, fallback, { cooldownMs = 60_000, now = Date.now, logger = console } = {}) {
  let primaryDownUntil = 0;
  // The provider currently (or most recently) handling a request, for live progress in the UI.
  let route = null;

  const usable = (provider) => Boolean(provider?.isConfigured());
  const use = (provider, isFallback) => {
    route = { model: provider.modelName, isFallback };
    return provider;
  };

  return {
    modelName: usable(primary) ? primary.modelName : fallback?.modelName,
    fallbackModelName: usable(primary) && usable(fallback) ? fallback.modelName : null,
    isConfigured: () => usable(primary) || usable(fallback),
    currentRoute: () => route,
    /** Underlying providers with their role, used by the connection test. */
    providers: () => [
      ...(primary ? [{ role: 'primary', provider: primary }] : []),
      ...(fallback ? [{ role: 'fallback', provider: fallback }] : []),
    ],

    async complete(request, options = {}) {
      if (!usable(primary) && !usable(fallback)) throw new LlmNotConfiguredError();
      if (!usable(fallback)) return use(primary, false).complete(request, options);
      if (!usable(primary)) return use(fallback, false).complete(request, options);

      if (now() >= primaryDownUntil) {
        try {
          return await use(primary, false).complete(request, options);
        } catch (error) {
          if (!(error instanceof LlmTransientError || error instanceof LlmPermanentError)) throw error;
          primaryDownUntil = now() + cooldownMs;
          logger.warn(
            `[llm] primary ${primary.modelName} failed (${error.message.slice(0, 120)}); using fallback ${fallback.modelName} for the next ${Math.round(cooldownMs / 1000)} s`,
          );
        }
      }
      return use(fallback, true).complete(request, options);
    },
  };
}
