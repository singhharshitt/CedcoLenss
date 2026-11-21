/** Stores the AI-generated complaint / praise themes for each dataset (one row per dataset). */
export function createThemeRepository(db) {
  const getStmt = db.prepare(`SELECT * FROM dataset_themes WHERE dataset_id = ?`);
  const upsertStmt = db.prepare(`
    INSERT INTO dataset_themes (dataset_id, status, themes_json, input_hash, model, error_message)
    VALUES (@datasetId, @status, @themesJson, @inputHash, @model, @errorMessage)
    ON CONFLICT(dataset_id) DO UPDATE SET status = excluded.status, themes_json = excluded.themes_json,
      input_hash = excluded.input_hash, model = excluded.model, error_message = excluded.error_message,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`);

  // Rows left 'generating' by a restart, for datasets that are no longer processing (those get themes when they finish).
  const interruptedStmt = db.prepare(`
    SELECT t.dataset_id FROM dataset_themes t JOIN datasets d ON d.id = t.dataset_id
    WHERE t.status = 'generating' AND d.status NOT IN ('queued','processing')`);

  return {
    interruptedIds: () => interruptedStmt.all().map((r) => r.dataset_id),
    get(datasetId) {
      const row = getStmt.get(datasetId);
      if (!row) return null;
      let themes = null;
      try {
        themes = row.themes_json ? JSON.parse(row.themes_json) : null;
      } catch {
        themes = null;
      }
      return {
        status: row.status,
        themes,
        inputHash: row.input_hash,
        model: row.model,
        errorMessage: row.error_message,
        updatedAt: row.updated_at,
      };
    },
    save(datasetId, { status, themes = null, inputHash = null, model = null, errorMessage = null }) {
      upsertStmt.run({
        datasetId,
        status,
        themesJson: themes ? JSON.stringify(themes) : null,
        inputHash,
        model,
        errorMessage,
      });
    },
  };
}
