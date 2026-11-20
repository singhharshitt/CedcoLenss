import { z } from 'zod';
import { SENTIMENTS, TOPICS } from '../constants.js';

const id = z.coerce.number().int().positive();
const optionalText = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v ? v : undefined));
const optionalBool = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

export const DatasetParams = z.object({ datasetId: id });
export const ProductParams = z.object({ datasetId: id, productId: z.string().min(1).max(300) });
export const ReviewParams = z.object({ reviewId: id });

export const ReviewListQuery = z.object({
  product: optionalText,
  sentiment: z.enum(SENTIMENTS).optional(),
  topic: z.enum(TOPICS).optional(),
  status: z.enum(['pending', 'analysed', 'analysis_failed', 'skipped']).optional(),
  needsReply: optionalBool,
  mismatch: optionalBool,
  search: optionalText,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const ReplyBody = z.object({ regenerate: z.boolean().optional().default(false) }).strict();
