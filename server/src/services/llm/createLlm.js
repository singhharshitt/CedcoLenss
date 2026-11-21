import { createOpenAiCompatibleProvider } from './openaiCompatibleProvider.js';
import { createFallbackProvider } from './fallbackProvider.js';

/**
 * Builds the app's LLM provider from config: the primary provider, plus the
 * optional fallback (LLM_API_KEY2 ...) when one is configured.
 *
 * With a fallback available the primary gets at most 1 network retry, so an
 * overloaded or slow primary hands over quickly instead of backing off for minutes.
 */
export function createLlm(config) {
  const fallback = createOpenAiCompatibleProvider(config.llmFallback);
  if (!fallback.isConfigured()) return createOpenAiCompatibleProvider(config.llm);

  const primary = createOpenAiCompatibleProvider({
    ...config.llm,
    maxRetries: Math.min(config.llm.maxRetries, 1),
  });
  return createFallbackProvider(primary, fallback, { cooldownMs: config.llmFallbackCooldownMs });
}
