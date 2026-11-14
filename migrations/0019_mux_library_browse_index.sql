-- Compact, queryable records for the Mux library grid. Full Mux payloads stay
-- in the snapshot table; this index is only the data needed to browse/search.
CREATE TABLE IF NOT EXISTS mux_library_browse_assets (
  asset_id TEXT NOT NULL,
  refresh_id TEXT NOT NULL,
  title TEXT NOT NULL,
  client TEXT NOT NULL,
  library_status TEXT NOT NULL,
  created_at TEXT,
  has_custom_thumbnail INTEGER NOT NULL,
  search_text TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (asset_id, refresh_id)
);

CREATE INDEX IF NOT EXISTS mux_library_browse_filter
  ON mux_library_browse_assets (refresh_id, library_status, client, created_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS mux_library_browse_search
  USING fts5(asset_id UNINDEXED, refresh_id UNINDEXED, search_text);

CREATE TABLE IF NOT EXISTS mux_library_browse_state (
  id TEXT PRIMARY KEY,
  refresh_id TEXT,
  refreshed_at TEXT,
  asset_count INTEGER NOT NULL DEFAULT 0
);
