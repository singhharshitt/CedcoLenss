import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../config/env.js';
import { CsvValidationError, parseRating, parseReviewsCsv } from '../services/csvParser.js';
import { hashReviewText } from '../utils/textHash.js';

const HEADER = 'review_id,product,rating,date,review_text\n';
const parse = (csv) => parseReviewsCsv(csv, { maxRows: 1000 });
const assessment = parseReviewsCsv(fs.readFileSync(path.join(REPO_ROOT, 'reviews.csv')), { maxRows: 1000 });
const row = (id) => assessment.rows.find((r) => r.reviewId === id);

describe('CSV cleaning with the assessment dataset', () => {
  it('reads all 30 rows and reports accurate stats', () => {
    expect(assessment.stats).toEqual({
      totalRows: 30,
      validRows: 29,
      skippedRows: 1,
      duplicateRows: 1,
      uniqueReviews: 28,
    });
  });

  it('R005: empty review text is skipped and flagged, not dropped', () => {
    expect(row('R005')).toMatchObject({ status: 'skipped', skipReason: 'empty_review', textHash: null });
    expect(row('R005').dataIssues).toContain('empty_review');
  });

  it('R010: missing rating becomes null but the review is still analysed', () => {
    expect(row('R010')).toMatchObject({ rating: null, status: 'pending' });
    expect(row('R010').dataIssues).toContain('missing_rating');
  });

  it('R022: rating "five" is invalid -> null, raw value preserved, still analysed', () => {
    expect(row('R022')).toMatchObject({ rating: null, rawRating: 'five', status: 'pending' });
    expect(row('R022').dataIssues).toContain('invalid_rating');
  });

  it('R009: an emoji-only review is a real review, not empty', () => {
    expect(row('R009')).toMatchObject({ reviewText: '👍👍', status: 'pending' });
  });

  it('R015 is detected as a duplicate of R012 (same text)', () => {
    expect(row('R012').isDuplicate).toBe(false);
    expect(row('R015')).toMatchObject({ isDuplicate: true, duplicateOfRow: row('R012').rowNumber });
    expect(row('R015').textHash).toBe(row('R012').textHash);
  });

  it('keeps Hindi, Hinglish and HTML-looking text exactly as written', () => {
    expect(row('R016').reviewText).toBe('आवाज़ अच्छी है लेकिन बैटरी जल्दी खत्म हो जाती है।');
    expect(row('R004').reviewText).toContain('packaging bahut kharab');
    expect(row('R024').reviewText.startsWith('<b>Love it!</b>')).toBe(true);
  });
});

describe('CSV parsing edge cases', () => {
  it('handles BOM, quoted commas, escaped quotes and line breaks inside a cell', () => {
    const csv = '﻿' + HEADER + 'A1,Mug,4,2026-01-01,"Nice, ""really"" nice\nsecond line"\nA2,Mug,3,2026-01-02,ok\n';
    const { rows } = parse(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].reviewText).toBe('Nice, "really" nice\nsecond line');
    expect(rows[1].reviewId).toBe('A2');
  });

  it('treats whitespace-only text as empty and trims surrounding whitespace', () => {
    const { rows } = parse(HEADER + 'A1,Mug,4,2026-01-01,"   \n  "\nA2,  Mug  , 5 ,2026-01-01,"  hi  "\n');
    expect(rows[0].status).toBe('skipped');
    expect(rows[1]).toMatchObject({ product: 'Mug', rating: 5, reviewText: 'hi' });
  });

  it('flags a malformed row without failing the rest of the file', () => {
    const { rows, stats } = parse(HEADER + 'A1,Mug,4,2026-01-01,Good, but extra comma\nA2,Mug,4,2026-01-01,fine\n');
    expect(rows[0]).toMatchObject({ status: 'skipped', skipReason: 'malformed_row' });
    expect(rows[1].status).toBe('pending');
    expect(stats.validRows).toBe(1);
  });

  it('flags invalid dates without inventing one', () => {
    const { rows } = parse(HEADER + 'A1,Mug,4,2026-02-30,text\nA2,Mug,4,,text two\n');
    expect(rows[0]).toMatchObject({ normalizedDate: null, originalDate: '2026-02-30' });
    expect(rows[0].dataIssues).toContain('invalid_date');
    expect(rows[1].dataIssues).toContain('missing_date');
  });

  it('rejects a file without the required header columns', () => {
    expect(() => parse('id,text\n1,hello\n')).toThrow(CsvValidationError);
    expect(() => parse('id,text\n1,hello\n')).toThrow(/Missing required column/);
  });

  it('rejects non-UTF-8 and binary uploads with a clear error', () => {
    expect(() => parseReviewsCsv(Buffer.from([0xff, 0xfe, 0x00, 0x41]), { maxRows: 10 })).toThrow(CsvValidationError);
  });

  it('parses ratings strictly: integers 1-5 only', () => {
    expect(parseRating('5').rating).toBe(5);
    expect(parseRating('1').rating).toBe(1);
    for (const bad of ['', 'five', '7', '0', '4.5', '-1']) expect(parseRating(bad).rating).toBeNull();
  });

  it('hashing is conservative: whitespace differences match, wording differences do not', () => {
    expect(hashReviewText('Great  mug\n')).toBe(hashReviewText(' Great mug'));
    expect(hashReviewText('Great mug')).not.toBe(hashReviewText('Great mug!'));
  });
});
