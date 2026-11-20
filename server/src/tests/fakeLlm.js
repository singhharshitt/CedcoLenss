/**
 * TEST-ONLY fake LLM provider. It implements the same interface as the real
 * OpenAI-compatible provider but answers locally, so tests never need an API key
 * or network access. Never imported by production code.
 */

const NEGATIVE = [
  'stopped working', 'broken', 'terrible', 'wrong', 'rude', 'never', 'misleading', 'smaller',
  'used pair', 'dropping', 'no response', 'no refund', '🙄', 'kharab', 'cannot hear', 'not microwave',
];
const POSITIVE = ['love', 'great', 'best', 'happy', 'soft', 'beautiful', 'comfortable', 'badhiya', '👍', 'neat', 'good'];

const TOPIC_WORDS = {
  quality: ['quality', 'stopped working', 'broken', 'handles', 'sound', 'mic', 'fabric', 'sole', 'comfortable', 'sturdy'],
  delivery: ['deliver', 'arrived', 'package never', 'tracking'],
  price: ['price', 'overpriced', 'cheaper'],
  packaging: ['packaging', 'box'],
  support: ['support', 'refund', 'ticket', 'exchange'],
  size_fit: ['size', 'tight', 'smaller', 'fit'],
};

/** A plausible, schema-valid analysis derived from keywords. */
export function keywordAnalysis(text) {
  const lower = text.toLowerCase();
  const neg = NEGATIVE.some((w) => lower.includes(w));
  const pos = POSITIVE.some((w) => lower.includes(w));
  const sentiment = neg ? 'negative' : pos ? 'positive' : 'neutral';
  const topics = Object.entries(TOPIC_WORDS)
    .filter(([, words]) => words.some((w) => lower.includes(w)))
    .map(([topic]) => topic);
  return {
    sentiment,
    topics: topics.length ? topics : ['other'],
    summary: `Customer review summary (${sentiment}).`,
    needs_reply: sentiment === 'negative',
  };
}

/**
 * @param respond optional (request, callIndex) => string | throws. Defaults to a
 *                valid batch answer built with keywordAnalysis().
 */
export function createFakeLlm({ respond, configured = true } = {}) {
  const calls = [];
  const fake = {
    modelName: 'fake-model',
    calls,
    isConfigured: () => configured,
    async complete(request, { onAttempt = () => {} } = {}) {
      onAttempt();
      calls.push(request);
      if (respond) return respond(request, calls.length - 1);
      return defaultRespond(request);
    },
  };
  return fake;
}

export function defaultRespond(request) {
  const input = JSON.parse(request.user);
  if (input.review) {
    return JSON.stringify({
      reply: `We're sorry to hear about your experience with the ${input.review.product}. Please contact our support team with your order details so we can look into this for you.`,
    });
  }
  return JSON.stringify({
    results: input.reviews.map((r) => ({ ref: r.ref, analysis: keywordAnalysis(r.text) })),
  });
}
