-- Retry/audit ledger for non-destructive video swaps.
CREATE TABLE IF NOT EXISTS mux_asset_replacements (
  asset_id TEXT PRIMARY KEY,
  replacement_asset_id TEXT NOT NULL UNIQUE,
  result_json TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Register pre-existing generations without immediately deleting their rows.
CREATE TABLE IF NOT EXISTS mux_catalog_generations (
  kind TEXT NOT NULL,
  refresh_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(kind, refresh_id)
);
CREATE INDEX IF NOT EXISTS mux_catalog_generations_age ON mux_catalog_generations(kind, created_at);
INSERT OR IGNORE INTO mux_catalog_generations
SELECT 'snapshot', refresh_id, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM mux_library_assets GROUP BY refresh_id;
INSERT OR IGNORE INTO mux_catalog_generations
SELECT 'browse', refresh_id, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM mux_library_browse_assets GROUP BY refresh_id;
INSERT OR IGNORE INTO mux_catalog_generations
SELECT 'browse', refresh_id, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM mux_library_browse_search GROUP BY refresh_id;
