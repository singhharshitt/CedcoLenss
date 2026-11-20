import { createHash } from 'node:crypto';

/**
 * Conservative normalisation used for duplicate detection and the cache key.
 * - Unicode NFC so visually identical Hindi/emoji sequences compare equal
 * - trim + collapse runs of whitespace (incl. line breaks inside quoted CSV cells)
 * Case and punctuation are kept on purpose so different reviews are never merged.
 */
export function normalizeReviewText(text) {
  return text.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

/** SHA-256 (hex) of the normalised review text. */
export function hashReviewText(text) {
  return createHash('sha256').update(normalizeReviewText(text), 'utf8').digest('hex');
}
