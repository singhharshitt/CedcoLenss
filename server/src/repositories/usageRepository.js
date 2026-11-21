/** Per-dataset LLM call counts, broken down by the model that served them and why. */
export function createUsageRepository(db) {
  const addStmt = db.prepare(`
    INSERT INTO llm_usage (dataset_id, model, purpose, calls) VALUES (@datasetId, @model, @purpose, 1)
    ON CONFLICT(dataset_id, model, purpose) DO UPDATE SET calls = calls + 1`);
  const listStmt = db.prepare(`
    SELECT model, purpose, calls FROM llm_usage WHERE dataset_id = ? ORDER BY calls DESC, model, purpose`);

  return {
    /** Records one HTTP request to `model` (call it once per attempt, retries included). */
    add(datasetId, model, purpose) {
      addStmt.run({ datasetId, model: model || 'unknown', purpose });
    },
    /** [{ model, purpose, calls }] */
    forDataset: (datasetId) => listStmt.all(datasetId),
  };
}
