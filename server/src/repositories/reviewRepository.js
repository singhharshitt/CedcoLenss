/**
 * SQL access for the `reviews` table. Every query uses bound parameters;
 * user input never becomes part of the SQL text.
 */

/** 1 when the star rating disagrees with the AI sentiment, 0 when it agrees, NULL when unknown. */
export const MISMATCH_SQL = `CASE
  WHEN r.rating IS NULL OR r.sentiment IS NULL THEN NULL
  WHEN (r.rating <= 2 AND r.sentiment = 'negative')
    OR (r.rating = 3  AND r.sentiment = 'neutral')
    OR (r.rating >= 4 AND r.sentiment = 'positive') THEN 0
  ELSE 1 END`;

const SELECT_COLUMNS = `r.*, c.review_id AS canonical_review_ref, ${MISMATCH_SQL} AS rating_mismatch`;

/** Converts a DB row into the shape returned by the API. */
export function toReviewDto(row) {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    rowNumber: row.row_number,
    reviewId: row.review_id,
    product: row.product,
    rating: row.rating,
    rawRating: row.raw_rating,
    originalDate: row.original_date,
    date: row.normalized_date,
    reviewText: row.review_text,
    isDuplicate: row.is_duplicate === 1,
    duplicateOf: row.canonical_review_ref ?? null,
    status: row.status,
    skipReason: row.skip_reason,
    dataIssues: JSON.parse(row.data_issues || '[]'),
    sentiment: row.sentiment,
    topics: row.topics ? JSON.parse(row.topics) : [],
    summary: row.summary,
    needsReply: row.needs_reply == null ? null : row.needs_reply === 1,
    analysisSource: row.analysis_source,
    failureReason: row.failure_reason,
    suggestedReply: row.suggested_reply,
    ratingMismatch: row.rating_mismatch == null ? null : row.rating_mismatch === 1,
  };
}

/** LIKE pattern that treats %, _ and \ in user input literally. */
function likePattern(text) {
  return `%${text.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export function createReviewRepository(db) {
  const insertStmt = db.prepare(`
    INSERT INTO reviews (dataset_id, row_number, review_id, product, rating, raw_rating, original_date,
      normalized_date, review_text, text_hash, is_duplicate, canonical_review_id, status, skip_reason, data_issues)
    VALUES (@datasetId, @rowNumber, @reviewId, @product, @rating, @rawRating, @originalDate,
      @normalizedDate, @reviewText, @textHash, @isDuplicate, @canonicalId, @status, @skipReason, @dataIssues)`);

  const saveAnalysisStmt = db.prepare(`
    UPDATE reviews SET status = 'analysed', sentiment = @sentiment, topics = @topics, summary = @summary,
      needs_reply = @needsReply, analysis_source = @source, failure_reason = NULL
    WHERE id = @id`);

  const markFailedStmt = db.prepare(`
    UPDATE reviews SET status = 'analysis_failed', failure_reason = @reason, sentiment = NULL, topics = NULL,
      summary = NULL, needs_reply = NULL, analysis_source = NULL
    WHERE id = @id`);

  // Copies the canonical row's outcome onto its duplicates so every uploaded row stays inspectable.
  const syncDuplicatesStmt = db.prepare(`
    UPDATE reviews AS d SET
      status = c.status,
      sentiment = c.sentiment, topics = c.topics, summary = c.summary, needs_reply = c.needs_reply,
      analysis_source = CASE WHEN c.status = 'analysed' THEN 'duplicate' ELSE NULL END,
      failure_reason = c.failure_reason
    FROM reviews AS c
    WHERE d.dataset_id = ? AND d.is_duplicate = 1 AND d.canonical_review_id = c.id
      AND c.status IN ('analysed', 'analysis_failed')`);

  const pendingCanonicalStmt = db.prepare(`
    SELECT id, product, review_text, text_hash FROM reviews
    WHERE dataset_id = ? AND status = 'pending' AND is_duplicate = 0 ORDER BY row_number`);

  const resetFailedStmt = db.prepare(`
    UPDATE reviews SET status = 'pending', failure_reason = NULL
    WHERE dataset_id = ? AND status = 'analysis_failed'`);

  const getStmt = db.prepare(`
    SELECT ${SELECT_COLUMNS} FROM reviews r LEFT JOIN reviews c ON c.id = r.canonical_review_id WHERE r.id = ?`);

  const allStmt = db.prepare(`
    SELECT ${SELECT_COLUMNS} FROM reviews r LEFT JOIN reviews c ON c.id = r.canonical_review_id
    WHERE r.dataset_id = ? ORDER BY r.row_number`);

  const productsStmt = db.prepare(`SELECT DISTINCT product FROM reviews WHERE dataset_id = ? ORDER BY product`);

  const setReplyStmt = db.prepare(`UPDATE reviews SET suggested_reply = ? WHERE id = ?`);

  return {
    /** Inserts parsed CSV rows in one transaction and links duplicates to their canonical row. */
    insertParsedRows: db.transaction((datasetId, rows) => {
      const idByRowNumber = new Map();
      for (const row of rows) {
        const result = insertStmt.run({
          datasetId,
          rowNumber: row.rowNumber,
          reviewId: row.reviewId,
          product: row.product,
          rating: row.rating,
          rawRating: row.rawRating,
          originalDate: row.originalDate,
          normalizedDate: row.normalizedDate,
          reviewText: row.reviewText,
          textHash: row.textHash,
          isDuplicate: row.isDuplicate ? 1 : 0,
          canonicalId: row.isDuplicate ? idByRowNumber.get(row.duplicateOfRow) : null,
          status: row.status,
          skipReason: row.skipReason,
          dataIssues: JSON.stringify(row.dataIssues),
        });
        idByRowNumber.set(row.rowNumber, Number(result.lastInsertRowid));
      }
    }),

    pendingCanonical: (datasetId) => pendingCanonicalStmt.all(datasetId),

    saveAnalysis: (id, analysis, source) =>
      saveAnalysisStmt.run({
        id,
        sentiment: analysis.sentiment,
        topics: JSON.stringify(analysis.topics),
        summary: analysis.summary,
        needsReply: analysis.needs_reply ? 1 : 0,
        source,
      }),

    markFailed: (id, reason) => markFailedStmt.run({ id, reason: String(reason).slice(0, 500) }),
    syncDuplicates: (datasetId) => syncDuplicatesStmt.run(datasetId),
    resetFailed: (datasetId) => resetFailedStmt.run(datasetId).changes,

    getById: (id) => {
      const row = getStmt.get(id);
      return row ? toReviewDto(row) : null;
    },
    allForDataset: (datasetId) => allStmt.all(datasetId).map(toReviewDto),
    productNames: (datasetId) => productsStmt.all(datasetId).map((r) => r.product),
    setSuggestedReply: (id, reply) => setReplyStmt.run(reply, id),

    /**
     * Filtered + paginated listing.
     * filters: { product, sentiment, topic, status, needsReply, mismatch, search, page, limit }
     */
    list(datasetId, filters) {
      const where = ['r.dataset_id = @datasetId'];
      const params = { datasetId };

      if (filters.product) {
        where.push('r.product = @product');
        params.product = filters.product;
      }
      if (filters.sentiment) {
        where.push('r.sentiment = @sentiment');
        params.sentiment = filters.sentiment;
      }
      if (filters.topic) {
        where.push('EXISTS (SELECT 1 FROM json_each(r.topics) WHERE json_each.value = @topic)');
        params.topic = filters.topic;
      }
      if (filters.status) {
        where.push('r.status = @status');
        params.status = filters.status;
      }
      if (filters.needsReply !== undefined) {
        where.push('r.needs_reply = @needsReply');
        params.needsReply = filters.needsReply ? 1 : 0;
      }
      if (filters.mismatch) {
        where.push(`(${MISMATCH_SQL}) = 1`);
      }
      if (filters.search) {
        where.push(
          `(r.review_text LIKE @search ESCAPE '\\' OR r.product LIKE @search ESCAPE '\\'
            OR r.review_id LIKE @search ESCAPE '\\' OR r.summary LIKE @search ESCAPE '\\')`,
        );
        params.search = likePattern(filters.search);
      }

      const whereSql = where.join(' AND ');
      const total = db.prepare(`SELECT COUNT(*) AS n FROM reviews r WHERE ${whereSql}`).get(params).n;
      const offset = (filters.page - 1) * filters.limit;
      const rows = db
        .prepare(
          `SELECT ${SELECT_COLUMNS} FROM reviews r LEFT JOIN reviews c ON c.id = r.canonical_review_id
           WHERE ${whereSql} ORDER BY r.row_number LIMIT @limit OFFSET @offset`,
        )
        .all({ ...params, limit: filters.limit, offset });

      return {
        items: rows.map(toReviewDto),
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / filters.limit)),
      };
    },
  };
}
