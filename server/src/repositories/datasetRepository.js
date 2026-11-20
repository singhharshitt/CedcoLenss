/** SQL access for the `datasets` table. All queries use bound parameters. */
export function createDatasetRepository(db) {
  const statements = {
    insert: db.prepare(`INSERT INTO datasets (filename, status) VALUES (?, 'queued')`),
    get: db.prepare(`SELECT * FROM datasets WHERE id = ?`),
    list: db.prepare(`SELECT * FROM datasets ORDER BY id DESC LIMIT ?`),
    unfinished: db.prepare(`SELECT id FROM datasets WHERE status IN ('queued','processing') ORDER BY id`),
    markProcessing: db.prepare(
      `UPDATE datasets SET status = 'processing', error_message = NULL,
         started_at = COALESCE(started_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ?`,
    ),
    markQueued: db.prepare(`UPDATE datasets SET status = 'queued', finished_at = NULL WHERE id = ?`),
    finish: db.prepare(
      `UPDATE datasets SET status = @status, error_message = @errorMessage,
         processing_time_ms = COALESCE(processing_time_ms, 0) + @elapsedMs,
         finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = @id`,
    ),
    addCounters: db.prepare(
      `UPDATE datasets SET cache_hits = cache_hits + @cacheHits, ai_calls = ai_calls + @aiCalls,
         sent_to_ai = sent_to_ai + @sentToAi WHERE id = @id`,
    ),
    // Row counts are always recomputed from `reviews`, so they can never drift.
    refreshCounts: db.prepare(`
      UPDATE datasets SET
        total_rows     = (SELECT COUNT(*) FROM reviews WHERE dataset_id = @id),
        valid_rows     = (SELECT COUNT(*) FROM reviews WHERE dataset_id = @id AND status != 'skipped'),
        skipped_rows   = (SELECT COUNT(*) FROM reviews WHERE dataset_id = @id AND status = 'skipped'),
        duplicate_rows = (SELECT COUNT(*) FROM reviews WHERE dataset_id = @id AND is_duplicate = 1),
        unique_reviews = (SELECT COUNT(*) FROM reviews WHERE dataset_id = @id AND status != 'skipped' AND is_duplicate = 0),
        analysed_rows  = (SELECT COUNT(*) FROM reviews WHERE dataset_id = @id AND is_duplicate = 0 AND status = 'analysed'),
        failed_rows    = (SELECT COUNT(*) FROM reviews WHERE dataset_id = @id AND is_duplicate = 0 AND status = 'analysis_failed')
      WHERE id = @id`),
  };

  return {
    create: (filename) => Number(statements.insert.run(filename).lastInsertRowid),
    get: (id) => statements.get.get(id) ?? null,
    list: (limit = 50) => statements.list.all(limit),
    unfinishedIds: () => statements.unfinished.all().map((r) => r.id),
    markProcessing: (id) => statements.markProcessing.run(id),
    markQueued: (id) => statements.markQueued.run(id),
    finish: (id, { status, errorMessage = null, elapsedMs }) =>
      statements.finish.run({ id, status, errorMessage, elapsedMs: Math.round(elapsedMs) }),
    addCounters: (id, { cacheHits = 0, aiCalls = 0, sentToAi = 0 }) =>
      statements.addCounters.run({ id, cacheHits, aiCalls, sentToAi }),
    refreshCounts: (id) => statements.refreshCounts.run({ id }),
  };
}
