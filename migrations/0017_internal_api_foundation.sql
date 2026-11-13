-- Canonical links between Mux assets and The Deck. The Mux asset remains the
-- media authority; this table only records the production relationship.
CREATE TABLE IF NOT EXISTS production_card_video_links (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  linked_by_type TEXT NOT NULL CHECK (linked_by_type IN ('user', 'integration')),
  linked_by_id TEXT NOT NULL,
  source_uploaded_at TEXT,
  uploader_name TEXT,
  uploader_email TEXT,
  UNIQUE(card_id, asset_id),
  FOREIGN KEY (card_id) REFERENCES production_cards(id)
);
CREATE INDEX IF NOT EXISTS production_card_video_links_asset ON production_card_video_links(asset_id, linked_at DESC);

-- Append-only activity created by API actions. Imported Basecamp activity and
-- local comments remain in their existing tables.
CREATE TABLE IF NOT EXISTS production_card_activity (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'integration')),
  actor_id TEXT NOT NULL,
  asset_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  link_id TEXT,
  UNIQUE(link_id, event_type),
  FOREIGN KEY (card_id) REFERENCES production_cards(id),
  FOREIGN KEY (link_id) REFERENCES production_card_video_links(id)
);
CREATE INDEX IF NOT EXISTS production_card_activity_card_time ON production_card_activity(card_id, occurred_at DESC);

-- Direct-upload provenance gives agents the uploader and original upload time
-- when Mux itself only exposes a creator ID.
CREATE TABLE IF NOT EXISTS mux_asset_ingests (
  upload_id TEXT PRIMARY KEY,
  asset_id TEXT UNIQUE,
  requested_title TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  uploader_name TEXT,
  uploader_email TEXT
);
CREATE INDEX IF NOT EXISTS mux_asset_ingests_asset ON mux_asset_ingests(asset_id);

-- Hashed, scoped credentials for future MCP and automation clients. Existing
-- PRODUCTION_API_TOKEN remains a temporary compatibility credential.
CREATE TABLE IF NOT EXISTS api_integration_credentials (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  secret_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT
);
