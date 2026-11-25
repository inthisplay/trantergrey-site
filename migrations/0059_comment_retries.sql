CREATE TABLE IF NOT EXISTS production_comment_requests (
  actor_key TEXT NOT NULL,
  request_id TEXT NOT NULL,
  input_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(actor_key, request_id)
);
