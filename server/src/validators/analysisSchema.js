import { z } from 'zod';
import { SENTIMENTS, TOPICS } from '../constants.js';

const DEVANAGARI = /[ऀ-ॿ]/;

/**
 * The exact four-field analysis object. `.strict()` rejects extra keys, so a
 * response is only accepted when it matches the contract precisely.
 */
export const ReviewAnalysisSchema = z
  .object({
    sentiment: z.enum(SENTIMENTS),
    topics: z
      .array(z.enum(TOPICS))
      .min(1, 'topics must contain at least one value')
      .refine((t) => new Set(t).size === t.length, 'topics must not repeat'),
    summary: z
      .string()
      .trim()
      .min(1, 'summary must not be empty')
      .max(300, 'summary is too long')
      .refine((s) => !/[\r\n]/.test(s), 'summary must be a single line')
      // Cheap "is it English?" guard: the main failure mode is the model echoing Hindi text.
      .refine((s) => !DEVANAGARI.test(s), 'summary must be written in English'),
    needs_reply: z.boolean(),
  })
  .strict();

/** Envelope for a batch answer: one entry per input review, matched by `ref`. */
export const BatchResponseSchema = z
  .object({
    results: z.array(z.object({ ref: z.string(), analysis: z.unknown() }).strict()),
  })
  .strict();

/** Turns a ZodError into a short human-readable reason for logs and the UI. */
export function describeZodError(error) {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || 'value'}: ${issue.message}`)
    .join('; ');
}
