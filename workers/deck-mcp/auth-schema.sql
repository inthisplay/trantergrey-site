-- Lives in a separate trial-only D1 database, never the site's identity tables.
CREATE TABLE IF NOT EXISTS oauth_records (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(kind, id)
);
CREATE INDEX IF NOT EXISTS oauth_records_expiry ON oauth_records(expires_at);

CREATE TABLE IF NOT EXISTS mcp_invitations (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  nickname TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  redeemed_at TEXT,
  revoked_at TEXT,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS mcp_invitations_email ON mcp_invitations(email, created_at);
