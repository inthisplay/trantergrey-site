-- Durable retry ledger: preserve records even if the created item is later deleted.
CREATE TABLE IF NOT EXISTS mcp_item_requests (
  request_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
