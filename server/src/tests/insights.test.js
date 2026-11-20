import { describe, expect, it } from 'vitest';
import { ratingAgreement, sentimentBreakdown, topThemes, uniqueAnalysed } from '../services/insights.js';

const review = (overrides) => ({
  id: 1,
  reviewId: 'R',
  product: 'Mug',
  status: 'analysed',
  isDuplicate: false,
  rating: 5,
  sentiment: 'positive',
  topics: ['quality'],
  summary: 's',
  needsReply: false,
  dataIssues: [],
  ...overrides,
});

describe('insight aggregation', () => {
  it('excludes duplicates, skipped and failed rows from aggregates', () => {
    const rows = [
      review({ reviewId: 'A' }),
      review({ reviewId: 'B', isDuplicate: true }),
      review({ reviewId: 'C', status: 'skipped', sentiment: null }),
      review({ reviewId: 'D', status: 'analysis_failed', sentiment: null }),
    ];
    expect(uniqueAnalysed(rows).map((r) => r.reviewId)).toEqual(['A']);
  });

  it('computes rating agreement (1-2 negative, 3 neutral, 4-5 positive) ignoring unknown ratings', () => {
    const rows = [
      review({ reviewId: 'R008', rating: 5, sentiment: 'negative' }), // mismatch
      review({ reviewId: 'ok1', rating: 1, sentiment: 'negative' }),
      review({ reviewId: 'ok2', rating: 3, sentiment: 'neutral' }),
      review({ reviewId: 'R010', rating: null, sentiment: 'neutral' }), // excluded
    ];
    const result = ratingAgreement(rows);
    expect(result).toMatchObject({ eligible: 3, agreeing: 2, mismatches: 1, percentage: 66.7, excludedNoRating: 1 });
    expect(result.mismatchReviews[0]).toMatchObject({ reviewId: 'R008', expected: 'positive' });
  });

  it('ranks complaints by number of unique negative reviews, with evidence', () => {
    const rows = [
      review({ reviewId: '1', sentiment: 'negative', topics: ['delivery'], summary: 'Late.' }),
      review({ reviewId: '2', sentiment: 'negative', topics: ['delivery', 'support'], product: 'Shoes' }),
      review({ reviewId: '3', sentiment: 'negative', topics: ['quality'] }),
      review({ reviewId: '4', sentiment: 'positive', topics: ['delivery'] }),
    ];
    const complaints = topThemes(rows, 'negative');
    expect(complaints[0]).toMatchObject({ topic: 'delivery', count: 2 });
    expect(complaints[0].products).toHaveLength(2);
    expect(complaints[0].evidence[0]).toEqual({ reviewId: '1', summary: 'Late.' });
    expect(complaints).toHaveLength(3);
  });

  it('percentages use the unique analysed count as denominator', () => {
    const split = sentimentBreakdown([review({}), review({ sentiment: 'negative' }), review({ sentiment: 'negative' })]);
    expect(split.find((s) => s.sentiment === 'negative')).toEqual({ sentiment: 'negative', count: 2, percentage: 66.7 });
  });
});
