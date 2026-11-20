import { Router } from 'express';
import { ReplyBody, ReviewParams } from '../validators/requestSchemas.js';

/** /api/reviews — on-demand suggested replies. */
export function createReviewRoutes({ replyService }) {
  const router = Router();

  router.post('/:reviewId/reply', async (req, res) => {
    const { reviewId } = ReviewParams.parse(req.params);
    const { regenerate } = ReplyBody.parse(req.body ?? {});
    const result = await replyService.generate(reviewId, { regenerate });
    res.json({ data: result });
  });

  return router;
}
