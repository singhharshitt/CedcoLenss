/**
 * Errors raised by LLM providers. Kept separate from schema-validation failures:
 *  - LlmTransientError: worth retrying with backoff (429, 5xx, timeout, network)
 *  - LlmPermanentError: retrying will not help (bad key, unknown model, bad request)
 *  - LlmNotConfiguredError: server has no provider configured
 */
export class LlmTransientError extends Error {
  constructor(message, { status = null, retryAfterMs = null } = {}) {
    super(message);
    this.name = 'LlmTransientError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export class LlmPermanentError extends Error {
  constructor(message, { status = null } = {}) {
    super(message);
    this.name = 'LlmPermanentError';
    this.status = status;
  }
}

export class LlmNotConfiguredError extends Error {
  constructor() {
    super(
      'The AI provider is not configured. Set LLM_BASE_URL, LLM_MODEL and LLM_API_KEY in the server .env file (see .env.example) and restart the server.',
    );
    this.name = 'LlmNotConfiguredError';
  }
}
