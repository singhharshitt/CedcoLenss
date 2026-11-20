export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Exponential backoff with jitter: base * 2^attempt, capped at maxDelayMs,
 * then randomised to 50–100% of that value so many clients don't retry in lockstep.
 * A server-supplied Retry-After wins when it is longer (still capped at maxDelayMs).
 */
export function computeBackoffDelay(attempt, { baseDelayMs, maxDelayMs, retryAfterMs = null, random = Math.random }) {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  const jittered = exponential * (0.5 + random() * 0.5);
  if (retryAfterMs != null) return Math.min(Math.max(retryAfterMs, jittered), maxDelayMs);
  return jittered;
}

/**
 * Runs `fn` and retries it while `isRetryable(error)` is true, up to `maxRetries`
 * extra attempts. Non-retryable errors (e.g. a bad API key) are thrown immediately.
 *
 * Options: maxRetries, baseDelayMs, maxDelayMs, isRetryable(err),
 *          getRetryAfterMs(err), onRetry({attempt, delayMs, error}), sleep, random
 */
export async function retryWithBackoff(fn, options) {
  const {
    maxRetries,
    baseDelayMs,
    maxDelayMs,
    isRetryable,
    getRetryAfterMs = () => null,
    onRetry = () => {},
    sleep: wait = sleep,
    random = Math.random,
  } = options;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= maxRetries || !isRetryable(error)) throw error;
      const delayMs = computeBackoffDelay(attempt, {
        baseDelayMs,
        maxDelayMs,
        retryAfterMs: getRetryAfterMs(error),
        random,
      });
      onRetry({ attempt: attempt + 1, delayMs, error });
      await wait(delayMs);
    }
  }
}

/** Parses an HTTP Retry-After header (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(header, now = Date.now()) {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}
