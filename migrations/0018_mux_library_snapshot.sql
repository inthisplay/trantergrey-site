-- A local, replaceable view of the Mux catalog.  The active refresh is changed
-- only after every asset has been written, so readers never see a half-sync.
CREATE TABLE IF NOT EXISTS mux_library_assets (
  asset_id TEXT NOT NULL,
  refresh_id TEXT NOT NULL,
  value TEXT NOT NULL,
  refreshed_at TEXT NOT NULL,
  PRIMARY KEY (asset_id, refresh_id)
);

CREATE INDEX IF NOT EXISTS mux_library_assets_refresh
  ON mux_library_assets (refresh_id, asset_id);

CREATE TABLE IF NOT EXISTS mux_library_snapshot_state (
  id TEXT PRIMARY KEY,
  refresh_id TEXT,
  refreshed_at TEXT
);
