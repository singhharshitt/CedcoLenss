import { parseRetryAfter, retryWithBackoff } from '../../utils/retry.js';
import { LlmNotConfiguredError, LlmPermanentError, LlmTransientError } from './errors.js';

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function isLocalUrl(url) {
  try {
    return ['localhost', '127.0.0.1', '[::1]', 'host.docker.internal'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Configured = base URL + model, plus an API key unless the provider runs locally (e.g. Ollama). */
export function isLlmConfigured(llmConfig) {
  return Boolean(llmConfig.baseUrl && llmConfig.model && (llmConfig.apiKey || isLocalUrl(llmConfig.baseUrl)));
}

/**
 * LLM provider for any OpenAI-compatible Chat Completions API (Groq, OpenRouter,
 * Gemini's OpenAI endpoint, Ollama, ...).
 *
 * Every provider exposes the same interface so the analysis code never knows
 * which vendor it talks to:
 *   isConfigured(): boolean
 *   modelName: string
 *   complete({ system, user, json }, { onAttempt }) => Promise<string>
 *
 * Network/rate-limit retries with exponential backoff live here. Validating
 * the *content* of the answer is the caller's job.
 */
export function createOpenAiCompatibleProvider(llmConfig, { fetchImpl = fetch, sleep, random } = {}) {
  const configured = isLlmConfigured(llmConfig);

  async function requestOnce({ system, user, json }) {
    let response;
    try {
      response = await fetchImpl(`${llmConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(llmConfig.apiKey ? { Authorization: `Bearer ${llmConfig.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: llmConfig.model,
          temperature: 0,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: AbortSignal.timeout(llmConfig.timeoutMs),
      });
    } catch (error) {
      const reason = error?.name === 'TimeoutError' ? `timed out after ${llmConfig.timeoutMs} ms` : error?.message;
      throw new LlmTransientError(`LLM request failed: ${reason}`);
    }

    if (!response.ok) {
      // Only a short excerpt of the provider's body: useful for debugging, never echoes our key.
      const body = (await response.text().catch(() => '')).slice(0, 300);
      const message = `LLM provider returned HTTP ${response.status}${body ? `: ${body}` : ''}`;
      if (RETRYABLE_STATUS.has(response.status)) {
        throw new LlmTransientError(message, {
          status: response.status,
          retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
        });
      }
      throw new LlmPermanentError(message, { status: response.status });
    }

    const payload = await response.json().catch(() => null);
    const content = payload?.choices?.[0]?.message?.content;
    // An empty/odd body is returned as '' so the caller's schema validation (and its retry) handles it.
    return typeof content === 'string' ? content : '';
  }

  return {
    modelName: llmConfig.model,
    isConfigured: () => configured,

    async complete(request, { onAttempt = () => {} } = {}) {
      if (!configured) throw new LlmNotConfiguredError();
      return retryWithBackoff(
        () => {
          onAttempt();
          return requestOnce(request);
        },
        {
          maxRetries: llmConfig.maxRetries,
          baseDelayMs: llmConfig.retryBaseDelayMs,
          maxDelayMs: llmConfig.retryMaxDelayMs,
          isRetryable: (error) => error instanceof LlmTransientError,
          getRetryAfterMs: (error) => error.retryAfterMs ?? null,
          onRetry: ({ attempt, delayMs, error }) =>
            console.warn(`[llm] retry ${attempt}/${llmConfig.maxRetries} in ${Math.round(delayMs)} ms: ${error.message}`),
          sleep,
          random,
        },
      );
    },
  };
}
