-- Record the two catalog refresh milestones for a direct Mux upload. This
-- avoids rebuilding the catalog for each client-side processing poll.
ALTER TABLE mux_asset_ingests ADD COLUMN catalog_discovered_at TEXT;
ALTER TABLE mux_asset_ingests ADD COLUMN catalog_ready_at TEXT;
