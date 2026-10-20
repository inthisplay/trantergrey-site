CREATE TABLE IF NOT EXISTS contact_inquiries (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  business TEXT NOT NULL,
  focus TEXT NOT NULL,
  timeline TEXT NOT NULL,
  message TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS contact_inquiries_received_at ON contact_inquiries (received_at DESC);

-- These tables preserve the same units of data currently stored in the
-- file-backed Vimeo library and custom work collections. Their route and UI
-- migration follows after the form endpoint is verified in production.
CREATE TABLE IF NOT EXISTS vimeo_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_collections (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
