CREATE TABLE IF NOT EXISTS drive_access_cache (
 id TEXT PRIMARY KEY, connection_key TEXT NOT NULL, access_cipher TEXT,
 expires_at INTEGER NOT NULL DEFAULT 0, lease_owner TEXT, lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS maintenance_cursors (id TEXT PRIMARY KEY, cursor TEXT NOT NULL);
