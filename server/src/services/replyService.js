import { z } from 'zod';
import { REPLY_SYSTEM_PROMPT, buildReplyUserMessage } from './analysis/prompts.js';
import { HttpError } from '../utils/httpError.js';

const ReplySchema = z
  .object({ reply: z.string().trim().min(20, 'reply is too short').max(1200, 'reply is too long') })
  .strict();

function parseReply(raw) {
  try {
    const cleaned = raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/gi, '');
    const parsed = ReplySchema.safeParse(JSON.parse(cleaned));
    return parsed.success ? parsed.data.reply : null;
  } catch {
    return null;
  }
}

/**
 * Generates a suggested reply only when the user asks for one.
 * Reuses a stored reply unless `regenerate` is true. Output is validated and
 * retried once if invalid, like analyses.
 */
export function createReplyService({ reviews, llm }) {
  return {
    async generate(reviewDbId, { regenerate = false } = {}) {
      const review = reviews.getById(reviewDbId);
      if (!review) throw new HttpError(404, 'NOT_FOUND', 'Review not found.');
      if (review.status !== 'analysed') {
        throw new HttpError(409, 'NOT_ANALYSED', 'This review has not been analysed, so no reply can be generated.');
      }
      if (!review.needsReply) throw new HttpError(409, 'REPLY_NOT_NEEDED', 'This review is not marked as needing a reply.');
      if (review.suggestedReply && !regenerate) return { reply: review.suggestedReply, reused: true };
      if (!llm.isConfigured()) {
        throw new HttpError(503, 'LLM_NOT_CONFIGURED', 'The AI provider is not configured on the server. See .env.example.');
      }

      const request = {
        system: REPLY_SYSTEM_PROMPT,
        user: buildReplyUserMessage({
          product: review.product,
          review_text: review.reviewText,
          summary: review.summary,
          topics: review.topics,
        }),
        json: true,
      };

      for (let attempt = 0; attempt < 2; attempt++) {
        let raw;
        try {
          raw = await llm.complete(request);
        } catch (error) {
          console.error('[reply] LLM error:', error.message);
          throw new HttpError(502, 'LLM_ERROR', 'The AI provider could not generate a reply right now. Please try again.');
        }
        const reply = parseReply(raw);
        if (reply) {
          reviews.setSuggestedReply(review.id, reply);
          return { reply, reused: false };
        }
      }
      throw new HttpError(502, 'INVALID_AI_RESPONSE', 'The AI returned an invalid reply twice. Please try again.');
    },
  };
}
