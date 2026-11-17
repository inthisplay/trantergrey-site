CREATE TABLE IF NOT EXISTS client_directory (
  name TEXT PRIMARY KEY COLLATE NOCASE,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO client_directory (name, created_at)
SELECT DISTINCT TRIM(client), CURRENT_TIMESTAMP
FROM mux_asset_metadata
WHERE client IS NOT NULL AND TRIM(client) != '';

INSERT OR IGNORE INTO client_directory (name, created_at)
SELECT DISTINCT TRIM(client), CURRENT_TIMESTAMP
FROM production_card_overrides
WHERE client IS NOT NULL AND TRIM(client) != '';
