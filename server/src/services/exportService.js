/**
 * CSV export of every uploaded row with its cleaning flags and AI analysis.
 *
 * Safety: customer text is untrusted, so cells that a spreadsheet would treat as a
 * formula (starting with = + - @ tab or CR) are prefixed with an apostrophe
 * ("CSV injection"), and every cell is quoted per RFC 4180.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export const EXPORT_COLUMNS = [
  ['review_id', (r) => r.reviewId],
  ['product', (r) => r.product],
  ['rating', (r) => r.rating ?? r.rawRating],
  ['date', (r) => r.date ?? r.originalDate],
  ['review_text', (r) => r.reviewText],
  ['status', (r) => r.status],
  ['sentiment', (r) => r.sentiment],
  ['topics', (r) => r.topics.join('; ')],
  ['summary', (r) => r.summary],
  ['needs_reply', (r) => (r.needsReply == null ? '' : r.needsReply ? 'yes' : 'no')],
  ['rating_mismatch', (r) => (r.ratingMismatch == null ? '' : r.ratingMismatch ? 'yes' : 'no')],
  ['duplicate_of', (r) => r.duplicateOf],
  ['similar_to', (r) => r.similarTo],
  ['similarity', (r) => (r.similarity == null ? '' : Math.round(r.similarity * 100) + '%')],
  ['analysis_source', (r) => r.analysisSource],
  ['analysis_model', (r) => r.analysisModel],
  ['suggested_reply', (r) => r.suggestedReply],
  ['reply_edited', (r) => (r.suggestedReply ? (r.replyEdited ? 'yes' : 'no') : '')],
  ['data_issues', (r) => r.dataIssues.join('; ')],
  ['skip_reason', (r) => r.skipReason],
  ['failure_reason', (r) => r.failureReason],
];

/** Full CSV text (with a UTF-8 BOM so Excel shows Hindi and emoji correctly). */
export function reviewsToCsv(reviews) {
  const lines = [EXPORT_COLUMNS.map(([name]) => name).join(',')];
  for (const review of reviews) lines.push(EXPORT_COLUMNS.map(([, get]) => csvCell(get(review))).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** "reviews.csv" -> "reviews-analysis.csv" (filename was already sanitised at upload). */
export function exportFilename(datasetFilename) {
  const base = String(datasetFilename || 'reviews').replace(/\.csv$/i, '').replace(/[^\w.-]+/g, '_') || 'reviews';
  return `${base}-analysis.csv`;
}
