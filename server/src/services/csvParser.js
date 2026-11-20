import { parse } from 'csv-parse/sync';
import { hashReviewText } from '../utils/textHash.js';

export const REQUIRED_COLUMNS = ['review_id', 'product', 'rating', 'date', 'review_text'];
export const UNKNOWN_PRODUCT = 'Unknown product';

/** A problem with the file as a whole (bad header, not UTF-8, ...). Returned to the user as 400. */
export class CsvValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CsvValidationError';
  }
}

/** "5" -> 5. Anything that is not an integer 1-5 ("five", "7", "4.5", "") -> null. */
export function parseRating(raw) {
  const value = raw.trim();
  if (value === '') return { rating: null, issue: 'missing_rating' };
  if (/^[1-5]$/.test(value)) return { rating: Number(value), issue: null };
  return { rating: null, issue: 'invalid_rating' };
}

/** Accepts ISO dates (YYYY-MM-DD) that exist in the calendar. Never invents a date. */
export function parseIsoDate(raw) {
  const value = raw.trim();
  if (value === '') return { date: null, issue: 'missing_date' };
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    const [y, m, d] = match.slice(1).map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d) {
      return { date: value, issue: null };
    }
  }
  return { date: null, issue: 'invalid_date' };
}

function decodeUtf8(input) {
  if (typeof input === 'string') return input;
  if (input.includes(0)) {
    throw new CsvValidationError('The file looks binary, not a text CSV.');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(input);
  } catch {
    throw new CsvValidationError('The file is not valid UTF-8 text. Please save the CSV as UTF-8.');
  }
}

/**
 * Parses and cleans an uploaded reviews CSV.
 *
 * One bad record never fails the whole file: it is kept, flagged and skipped.
 * Only problems with the file itself (encoding, header, unbalanced quotes) throw.
 *
 * Each returned row has: rowNumber, reviewId, product, rating, rawRating,
 * originalDate, normalizedDate, reviewText, textHash, status ('pending'|'skipped'),
 * skipReason, dataIssues[], isDuplicate, duplicateOfRow.
 */
export function parseReviewsCsv(input, { maxRows }) {
  const text = decodeUtf8(input);

  let records;
  try {
    // csv-parse handles quoted commas, escaped quotes ("") and line breaks inside
    // quoted cells, so a single record may span several physical lines.
    records = parse(text, { bom: true, relax_column_count: true, skip_empty_lines: true });
  } catch (error) {
    throw new CsvValidationError(`Could not parse the CSV: ${error.message}`);
  }

  if (records.length === 0) throw new CsvValidationError('The file is empty.');

  const header = records[0].map((h) => h.replace(/^﻿/, '').trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((col) => !header.includes(col));
  if (missing.length > 0) {
    throw new CsvValidationError(
      `Missing required column(s): ${missing.join(', ')}. Expected header: ${REQUIRED_COLUMNS.join(',')}`,
    );
  }
  const col = Object.fromEntries(REQUIRED_COLUMNS.map((c) => [c, header.indexOf(c)]));

  const dataRecords = records.slice(1);
  if (dataRecords.length === 0) throw new CsvValidationError('The CSV has a header but no review rows.');
  if (dataRecords.length > maxRows) {
    throw new CsvValidationError(`Too many rows (${dataRecords.length}). The limit is ${maxRows}.`);
  }

  const firstRowByHash = new Map();
  const seenReviewIds = new Set();

  const rows = dataRecords.map((record, i) => {
    const rowNumber = i + 1;
    const field = (name) => (record[col[name]] ?? '').trim();
    const issues = [];

    let reviewId = field('review_id');
    if (!reviewId) {
      issues.push('missing_review_id');
      reviewId = `ROW-${rowNumber}`;
    } else if (seenReviewIds.has(reviewId)) {
      issues.push('duplicate_review_id');
    }
    seenReviewIds.add(reviewId);

    let product = field('product');
    if (!product) {
      issues.push('missing_product');
      product = UNKNOWN_PRODUCT;
    }

    const rawRating = field('rating');
    const { rating, issue: ratingIssue } = parseRating(rawRating);
    if (ratingIssue) issues.push(ratingIssue);

    const originalDate = field('date');
    const { date, issue: dateIssue } = parseIsoDate(originalDate);
    if (dateIssue) issues.push(dateIssue);

    const reviewText = field('review_text');
    const base = {
      rowNumber,
      reviewId,
      product,
      rating,
      rawRating: rawRating || null,
      originalDate: originalDate || null,
      normalizedDate: date,
      reviewText,
      isDuplicate: false,
      duplicateOfRow: null,
    };

    // A record whose cell count differs from the header cannot be trusted:
    // values may have shifted into the wrong columns (e.g. an unquoted comma).
    if (record.length !== header.length) {
      issues.push('malformed_row');
      return { ...base, textHash: null, status: 'skipped', skipReason: 'malformed_row', dataIssues: issues };
    }

    // Whitespace-only text is empty; emoji-only text (e.g. "👍👍") is kept.
    if (reviewText === '') {
      issues.push('empty_review');
      return { ...base, textHash: null, status: 'skipped', skipReason: 'empty_review', dataIssues: issues };
    }

    const textHash = hashReviewText(reviewText);
    const firstRow = firstRowByHash.get(textHash);
    if (firstRow === undefined) firstRowByHash.set(textHash, rowNumber);

    return {
      ...base,
      textHash,
      status: 'pending',
      skipReason: null,
      dataIssues: issues,
      isDuplicate: firstRow !== undefined,
      duplicateOfRow: firstRow ?? null,
    };
  });

  const validRows = rows.filter((r) => r.status === 'pending').length;
  const duplicateRows = rows.filter((r) => r.isDuplicate).length;
  return {
    rows,
    stats: {
      totalRows: rows.length,
      validRows,
      skippedRows: rows.length - validRows,
      duplicateRows,
      uniqueReviews: validRows - duplicateRows,
    },
  };
}
