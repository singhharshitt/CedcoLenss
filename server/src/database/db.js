import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/**
 * Schema migrations, applied in order. `PRAGMA user_version` stores how many
 * have run, so adding a migration = appending a new SQL string to this array.
 */
const MIGRATIONS = [
  /* v1 */ `
  CREATE TABLE IF NOT EXISTS datasets (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    filename           TEXT    NOT NULL,
    created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    status             TEXT    NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued','processing','completed','completed_with_errors','failed')),
    total_rows         INTEGER NOT NULL DEFAULT 0,
    valid_rows         INTEGER NOT NULL DEFAULT 0,
    skipped_rows       INTEGER NOT NULL DEFAULT 0,
    duplicate_rows     INTEGER NOT NULL DEFAULT 0,
    unique_reviews     INTEGER NOT NULL DEFAULT 0,
    sent_to_ai         INTEGER NOT NULL DEFAULT 0,
    analysed_rows      INTEGER NOT NULL DEFAULT 0,
    failed_rows        INTEGER NOT NULL DEFAULT 0,
    cache_hits         INTEGER NOT NULL DEFAULT 0,
    ai_calls           INTEGER NOT NULL DEFAULT 0,
    processing_time_ms INTEGER,
    started_at         TEXT,
    finished_at        TEXT,
    error_message      TEXT
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    dataset_id          INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    row_number          INTEGER NOT NULL,
    review_id           TEXT    NOT NULL,
    product             TEXT    NOT NULL,
    rating              INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
    raw_rating          TEXT,
    original_date       TEXT,
    normalized_date     TEXT,
    review_text         TEXT    NOT NULL,
    text_hash           TEXT,
    is_duplicate        INTEGER NOT NULL DEFAULT 0 CHECK (is_duplicate IN (0,1)),
    canonical_review_id INTEGER REFERENCES reviews(id),
    status              TEXT    NOT NULL
                        CHECK (status IN ('pending','analysed','analysis_failed','skipped')),
    skip_reason         TEXT,
    data_issues         TEXT    NOT NULL DEFAULT '[]',
    sentiment           TEXT CHECK (sentiment IS NULL OR sentiment IN ('positive','neutral','negative')),
    topics              TEXT,
    summary             TEXT,
    needs_reply         INTEGER CHECK (needs_reply IS NULL OR needs_reply IN (0,1)),
    analysis_source     TEXT CHECK (analysis_source IS NULL OR analysis_source IN ('ai','cache','duplicate')),
    failure_reason      TEXT,
    suggested_reply     TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_reviews_dataset   ON reviews(dataset_id);
  CREATE INDEX IF NOT EXISTS idx_reviews_product   ON reviews(dataset_id, product);
  CREATE INDEX IF NOT EXISTS idx_reviews_sentiment ON reviews(dataset_id, sentiment);
  CREATE INDEX IF NOT EXISTS idx_reviews_status    ON reviews(dataset_id, status);
  CREATE INDEX IF NOT EXISTS idx_reviews_hash      ON reviews(text_hash);

  CREATE TABLE IF NOT EXISTS analysis_cache (
    text_hash     TEXT PRIMARY KEY,
    analysis_json TEXT NOT NULL,
    model         TEXT,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  `,

  /* v2: model provenance, per-model usage, editable replies, near-duplicates, AI themes */ `
  -- The model that actually produced each analysis (primary or fallback).
  ALTER TABLE reviews ADD COLUMN analysis_model TEXT;
  -- 1 when the store owner edited the suggested reply by hand.
  ALTER TABLE reviews ADD COLUMN reply_edited INTEGER NOT NULL DEFAULT 0 CHECK (reply_edited IN (0,1));
  -- Very similar (but not identical) review in the same product, analysed separately.
  ALTER TABLE reviews ADD COLUMN similar_review_id INTEGER REFERENCES reviews(id);
  ALTER TABLE reviews ADD COLUMN similarity REAL;
  -- Which model produced a cache entry (analysis_cache.model is the cache key: primary model + prompt version).
  ALTER TABLE analysis_cache ADD COLUMN produced_by TEXT;

  CREATE TABLE IF NOT EXISTS llm_usage (
    dataset_id INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    model      TEXT    NOT NULL,
    purpose    TEXT    NOT NULL CHECK (purpose IN ('analysis','reply','themes')),
    calls      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (dataset_id, model, purpose)
  );

  CREATE TABLE IF NOT EXISTS dataset_themes (
    dataset_id    INTEGER PRIMARY KEY REFERENCES datasets(id) ON DELETE CASCADE,
    status        TEXT NOT NULL CHECK (status IN ('generating','ready','failed')),
    themes_json   TEXT,
    input_hash    TEXT,
    model         TEXT,
    error_message TEXT,
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  `,
];

/** Opens (and creates/migrates) the SQLite database. Use ':memory:' in tests. */
export function openDatabase(filePath) {
  if (filePath !== ':memory:') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[version]);
      db.pragma(`user_version = ${version + 1}`);
    })();
  }
}
