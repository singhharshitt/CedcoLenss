import { Router } from 'express';
import { EditedReplyBody, ReplyBody, ReviewParams } from '../validators/requestSchemas.js';

/** /api/reviews — on-demand suggested replies, and saving a hand-edited reply. */
export function createReviewRoutes({ replyService, expensiveLimit }) {
  const router = Router();

  // Generating costs an LLM call, so it gets the stricter rate limit.
  router.post('/:reviewId/reply', expensiveLimit, async (req, res) => {
    const { reviewId } = ReviewParams.parse(req.params);
    const { regenerate } = ReplyBody.parse(req.body ?? {});
    const result = await replyService.generate(reviewId, { regenerate });
    res.json({ data: result });
  });

  // Saving an edited reply is a plain DB write.
  router.put('/:reviewId/reply', (req, res) => {
    const { reviewId } = ReviewParams.parse(req.params);
    const { reply } = EditedReplyBody.parse(req.body ?? {});
    res.json({ data: replyService.saveEdited(reviewId, reply) });
  });

  return router;
}
