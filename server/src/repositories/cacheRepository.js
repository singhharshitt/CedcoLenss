import { ReviewAnalysisSchema } from '../validators/analysisSchema.js';

/**
 * Persistent analysis cache keyed by SHA-256 of the normalised review text.
 * Only validated analyses are written, and entries are re-validated on read so
 * a stale or hand-edited row can never leak an invalid analysis into results.
 *
 * Each entry records which model + prompt version produced it (`analyserId`).
 * An entry from a different analyser counts as a miss, so switching to a better
 * model or changing the prompt re-analyses reviews instead of reusing old output.
 */
export function createCacheRepository(db) {
  const getStmt = db.prepare(`SELECT analysis_json, model, produced_by FROM analysis_cache WHERE text_hash = ?`);
  const putStmt = db.prepare(`
    INSERT INTO analysis_cache (text_hash, analysis_json, model, produced_by) VALUES (@hash, @json, @model, @producedBy)
    ON CONFLICT(text_hash) DO UPDATE SET analysis_json = excluded.analysis_json, model = excluded.model,
      produced_by = excluded.produced_by, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
  const countStmt = db.prepare(`SELECT COUNT(*) AS n FROM analysis_cache`);

  return {
    /** Returns { analysis, producedBy } or null. `producedBy` is the model that really answered (may be null for old rows). */
    get(hash, analyserId) {
      const row = getStmt.get(hash);
      if (!row || row.model !== analyserId) return null;
      try {
        const parsed = ReviewAnalysisSchema.safeParse(JSON.parse(row.analysis_json));
        return parsed.success ? { analysis: parsed.data, producedBy: row.produced_by ?? null } : null;
      } catch {
        return null;
      }
    },
    put(hash, analysis, analyserId, producedBy = null) {
      const valid = ReviewAnalysisSchema.parse(analysis);
      putStmt.run({ hash, json: JSON.stringify(valid), model: analyserId, producedBy });
    },
    count: () => countStmt.get().n,
  };
}
