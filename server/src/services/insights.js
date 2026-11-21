import { SENTIMENTS, TOPICS, expectedSentimentForRating } from '../constants.js';

/**
 * Pure aggregation functions behind the dashboard and product pages.
 *
 * Counting rules (also documented in the README):
 *  - Aggregates use UNIQUE analysed reviews: duplicates (same text) are counted
 *    once, skipped rows (empty/malformed) and analysis_failed rows are excluded.
 *  - Percentages use that same unique-analysed count as the denominator.
 */

export const TOPIC_LABELS = {
  quality: 'Product quality',
  delivery: 'Delivery',
  price: 'Price & value',
  packaging: 'Packaging',
  support: 'Customer support',
  size_fit: 'Size & fit',
  other: 'Other',
};

const pct = (part, whole) => (whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10);

export const uniqueAnalysed = (reviews) => reviews.filter((r) => r.status === 'analysed' && !r.isDuplicate);

export function sentimentBreakdown(analysed) {
  return SENTIMENTS.map((sentiment) => {
    const count = analysed.filter((r) => r.sentiment === sentiment).length;
    return { sentiment, count, percentage: pct(count, analysed.length) };
  });
}

/**
 * Most frequent topics among reviews with the given sentiment
 * ("complaints" = negative, "praises" = positive). Each theme carries the
 * evidence it is based on: the real review summaries and IDs.
 */
export function topThemes(analysed, sentiment, limit = 3) {
  const groups = new Map();
  for (const review of analysed) {
    if (review.sentiment !== sentiment) continue;
    for (const topic of review.topics) {
      if (!groups.has(topic)) groups.set(topic, []);
      groups.get(topic).push(review);
    }
  }

  return [...groups.entries()]
    .sort(([topicA, a], [topicB, b]) => b.length - a.length || TOPICS.indexOf(topicA) - TOPICS.indexOf(topicB))
    .slice(0, limit)
    .map(([topic, list]) => {
      const productCounts = new Map();
      for (const r of list) productCounts.set(r.product, (productCounts.get(r.product) ?? 0) + 1);
      return {
        topic,
        label: TOPIC_LABELS[topic],
        count: list.length,
        products: [...productCounts.entries()]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
        evidence: list.slice(0, 3).map((r) => ({ reviewId: r.reviewId, summary: r.summary })),
        reviewIds: list.map((r) => r.reviewId),
      };
    });
}

/**
 * Rating agreement: stars 1–2 expect negative, 3 neutral, 4–5 positive.
 * Denominator = unique analysed reviews that have a valid rating
 * (missing/invalid ratings are excluded).
 */
export function ratingAgreement(analysed) {
  const eligible = analysed.filter((r) => r.rating != null);
  const mismatches = eligible.filter((r) => expectedSentimentForRating(r.rating) !== r.sentiment);
  return {
    eligible: eligible.length,
    agreeing: eligible.length - mismatches.length,
    mismatches: mismatches.length,
    percentage: eligible.length === 0 ? null : pct(eligible.length - mismatches.length, eligible.length),
    excludedNoRating: analysed.length - eligible.length,
    mismatchReviews: mismatches.map((r) => ({
      id: r.id,
      reviewId: r.reviewId,
      product: r.product,
      rating: r.rating,
      sentiment: r.sentiment,
      expected: expectedSentimentForRating(r.rating),
      summary: r.summary,
    })),
  };
}

/** How often each topic appears, split by sentiment (unique analysed reviews). */
export function topicBreakdown(analysed) {
  return TOPICS.map((topic) => {
    const withTopic = analysed.filter((r) => r.topics.includes(topic));
    const counts = Object.fromEntries(SENTIMENTS.map((s) => [s, withTopic.filter((r) => r.sentiment === s).length]));
    return { topic, label: TOPIC_LABELS[topic], total: withTopic.length, ...counts };
  }).filter((t) => t.total > 0);
}

export function dataQuality(reviews) {
  const withIssue = (issue) => reviews.filter((r) => r.dataIssues.includes(issue)).length;
  return {
    totalRows: reviews.length,
    emptyReviews: withIssue('empty_review'),
    malformedRows: withIssue('malformed_row'),
    missingRating: withIssue('missing_rating'),
    invalidRating: withIssue('invalid_rating'),
    invalidOrMissingDate: withIssue('invalid_date') + withIssue('missing_date'),
    duplicates: reviews.filter((r) => r.isDuplicate).length,
    nearDuplicates: withIssue('near_duplicate'),
    possibleDuplicates: withIssue('possible_duplicate'),
    failedAnalyses: reviews.filter((r) => r.status === 'analysis_failed' && !r.isDuplicate).length,
  };
}

/** Shape of a dataset row returned to the client, including progress. */
export function toDatasetDto(row) {
  const processed = row.analysed_rows + row.failed_rows;
  const done = ['completed', 'completed_with_errors', 'failed'].includes(row.status);
  return {
    id: row.id,
    filename: row.filename,
    createdAt: row.created_at,
    status: row.status,
    errorMessage: row.error_message,
    counts: {
      totalRows: row.total_rows,
      validRows: row.valid_rows,
      skippedRows: row.skipped_rows,
      duplicateRows: row.duplicate_rows,
      uniqueReviews: row.unique_reviews,
      cacheHits: row.cache_hits,
      sentToAi: row.sent_to_ai,
      analysed: row.analysed_rows,
      failed: row.failed_rows,
      aiCalls: row.ai_calls,
    },
    progress: {
      processed,
      total: row.unique_reviews,
      percentage: done ? 100 : row.unique_reviews === 0 ? 0 : Math.floor((processed / row.unique_reviews) * 100),
    },
    processingTimeMs: row.processing_time_ms,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export function buildDashboard(datasetRow, reviews) {
  const analysed = uniqueAnalysed(reviews);
  const sentiment = sentimentBreakdown(analysed);
  const bySentiment = Object.fromEntries(sentiment.map((s) => [s.sentiment, s]));
  const { mismatchReviews, ...agreement } = ratingAgreement(analysed);

  return {
    dataset: toDatasetDto(datasetRow),
    summary: {
      analysedReviews: analysed.length,
      positive: bySentiment.positive,
      neutral: bySentiment.neutral,
      negative: bySentiment.negative,
      needsReply: analysed.filter((r) => r.needsReply).length,
    },
    sentiment,
    topComplaints: topThemes(analysed, 'negative'),
    topPraises: topThemes(analysed, 'positive'),
    topicBreakdown: topicBreakdown(analysed),
    ratingAgreement: { ...agreement, mismatchReviews },
    dataQuality: dataQuality(reviews),
    usage: {
      aiCalls: datasetRow.ai_calls,
      cacheHits: datasetRow.cache_hits,
      sentToAi: datasetRow.sent_to_ai,
      uniqueReviews: datasetRow.unique_reviews,
      analysed: datasetRow.analysed_rows,
      failed: datasetRow.failed_rows,
      processingTimeMs: datasetRow.processing_time_ms,
      status: datasetRow.status,
    },
  };
}

function productStats(name, productReviews) {
  const analysed = uniqueAnalysed(productReviews);
  const ratings = productReviews.filter((r) => !r.isDuplicate && r.rating != null).map((r) => r.rating);
  const { mismatchReviews, ...agreement } = ratingAgreement(analysed);
  return {
    id: encodeURIComponent(name),
    name,
    totalRows: productReviews.length,
    analysedReviews: analysed.length,
    averageRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    sentiment: sentimentBreakdown(analysed),
    needsReply: analysed.filter((r) => r.needsReply).length,
    ratingAgreement: agreement,
    mismatchReviews,
    topComplaints: topThemes(analysed, 'negative'),
    topPraises: topThemes(analysed, 'positive'),
  };
}

export function buildProductList(reviews) {
  const byProduct = new Map();
  for (const r of reviews) {
    if (!byProduct.has(r.product)) byProduct.set(r.product, []);
    byProduct.get(r.product).push(r);
  }
  return [...byProduct.entries()]
    .map(([name, list]) => {
      const { mismatchReviews, ...stats } = productStats(name, list);
      return { ...stats, mismatches: mismatchReviews.length };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildProductDetail(name, reviews) {
  const productReviews = reviews.filter((r) => r.product === name);
  if (productReviews.length === 0) return null;
  return {
    ...productStats(name, productReviews),
    replyQueue: uniqueAnalysed(productReviews).filter((r) => r.needsReply),
  };
}
