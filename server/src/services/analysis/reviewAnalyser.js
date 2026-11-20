import { LlmPermanentError, LlmNotConfiguredError } from '../llm/errors.js';
import { BatchResponseSchema, ReviewAnalysisSchema, describeZodError } from '../../validators/analysisSchema.js';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserMessage } from './prompts.js';

/** Removes a ```json ... ``` fence some models wrap around JSON despite instructions. */
function stripCodeFence(text) {
  const match = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(text);
  return match ? match[1] : text;
}

/**
 * Validates one raw LLM answer for a batch.
 * Returns Map<ref, { ok: true, analysis } | { ok: false, reason }> with an entry for every input.
 * A broken envelope fails every review; a broken item fails only that review.
 */
export function validateBatchResponse(raw, refs) {
  const results = new Map();
  const failAll = (reason) => {
    for (const ref of refs) results.set(ref, { ok: false, reason });
    return results;
  };

  let json;
  try {
    json = JSON.parse(stripCodeFence(raw));
  } catch {
    return failAll('AI response was not valid JSON');
  }

  const envelope = BatchResponseSchema.safeParse(json);
  if (!envelope.success) return failAll(`AI response has the wrong shape (${describeZodError(envelope.error)})`);

  const byRef = new Map();
  for (const item of envelope.data.results) {
    if (!byRef.has(item.ref)) byRef.set(item.ref, item.analysis);
  }

  for (const ref of refs) {
    if (!byRef.has(ref)) {
      results.set(ref, { ok: false, reason: 'AI response did not include this review' });
      continue;
    }
    const parsed = ReviewAnalysisSchema.safeParse(byRef.get(ref));
    results.set(
      ref,
      parsed.success
        ? { ok: true, analysis: parsed.data }
        : { ok: false, reason: `Invalid analysis: ${describeZodError(parsed.error)}` },
    );
  }
  return results;
}

/**
 * Analyses a small batch of reviews with ONE LLM request, then gives each
 * review that came back invalid exactly ONE schema retry (all failures are
 * re-sent together in a second request). Reviews still invalid after the retry
 * are returned as failures; they never throw.
 *
 * Network/rate-limit problems are retried inside the provider. If those retries
 * are exhausted the affected reviews fail with that reason (no schema retry,
 * since the model never answered). Configuration errors are re-thrown so the
 * job can stop instead of failing every review one by one.
 *
 * @param items  [{ key, product, text }]
 * @returns Map<key, { ok: true, analysis } | { ok: false, reason }>
 */
export async function analyseReviews(items, llm, { onAiCall = () => {} } = {}) {
  const outcomes = new Map();

  async function attempt(batch) {
    // Short positional refs ("r1".."r5") keep the model's job simple and avoid
    // echoing arbitrary user-supplied IDs back through the prompt.
    const refs = batch.map((_, i) => `r${i + 1}`);
    const messageItems = batch.map((item, i) => ({ ref: refs[i], product: item.product, text: item.text }));
    let raw;
    try {
      raw = await llm.complete(
        { system: ANALYSIS_SYSTEM_PROMPT, user: buildAnalysisUserMessage(messageItems), json: true },
        { onAttempt: onAiCall },
      );
    } catch (error) {
      if (error instanceof LlmPermanentError || error instanceof LlmNotConfiguredError) throw error;
      // Transient errors that survived all backoff retries.
      for (const item of batch) outcomes.set(item.key, { ok: false, reason: error.message, retryable: false });
      return;
    }
    const validated = validateBatchResponse(raw, refs);
    batch.forEach((item, i) => outcomes.set(item.key, { ...validated.get(refs[i]), retryable: true }));
  }

  await attempt(items);

  const needRetry = items.filter((item) => {
    const outcome = outcomes.get(item.key);
    return !outcome.ok && outcome.retryable;
  });
  if (needRetry.length > 0) {
    console.warn(`[analysis] schema retry for ${needRetry.length} review(s)`);
    await attempt(needRetry);
  }

  // Drop the internal `retryable` flag from the public result.
  return new Map(
    [...outcomes].map(([key, { ok, analysis, reason }]) => [key, ok ? { ok, analysis } : { ok, reason }]),
  );
}
