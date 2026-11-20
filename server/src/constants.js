/** Allowed values for the LLM analysis schema. */
export const SENTIMENTS = ['positive', 'neutral', 'negative'];
export const TOPICS = ['quality', 'delivery', 'price', 'packaging', 'support', 'size_fit', 'other'];

/** Rating -> sentiment the stars imply (used for the rating mismatch check). */
export function expectedSentimentForRating(rating) {
  if (rating == null) return null;
  if (rating <= 2) return 'negative';
  if (rating === 3) return 'neutral';
  return 'positive';
}
