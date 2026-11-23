-- Shared by the API and MCP Worker; never stores payloads, tokens or raw IPs.
CREATE TABLE IF NOT EXISTS integration_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  hits INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS integration_rate_limits_expiry ON integration_rate_limits(expires_at);
CREATE TABLE IF NOT EXISTS integration_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  surface TEXT NOT NULL,
  operation TEXT NOT NULL,
  category TEXT NOT NULL,
  status INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS integration_events_time ON integration_events(occurred_at);
