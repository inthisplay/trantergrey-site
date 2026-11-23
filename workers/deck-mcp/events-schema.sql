-- Apply only to MCP_AUTH. Shared by the Pages Mux webhook and MCP Worker.
CREATE TABLE IF NOT EXISTS mcp_event_subscriptions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  callback_url TEXT NOT NULL,
  secret TEXT NOT NULL,
  previous_secret TEXT,
  previous_until INTEGER NOT NULL DEFAULT 0,
  verified_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mcp_event_subscriptions_expiry ON mcp_event_subscriptions(expires_at);
-- Small permanent deduplication ledger: one ready event per asset.
CREATE TABLE IF NOT EXISTS mcp_mux_events (
  asset_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  receipt_id TEXT NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mcp_event_deliveries (
  subscription_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','delivered','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt INTEGER NOT NULL,
  lease_until INTEGER NOT NULL DEFAULT 0,
  lease_id TEXT,
  finished_at INTEGER,
  PRIMARY KEY(subscription_id,event_id)
);
CREATE INDEX IF NOT EXISTS mcp_event_deliveries_due ON mcp_event_deliveries(state,next_attempt,lease_until);
