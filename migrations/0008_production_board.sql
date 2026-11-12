-- Immutable Basecamp mirror. Source IDs are deliberately retained so a later
-- Mux/card association can use a stable local identifier without guessing.
CREATE TABLE IF NOT EXISTS production_imports (
  id TEXT PRIMARY KEY,
  source_board_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
  source_counts TEXT NOT NULL,
  imported_counts TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS production_columns (
  source_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position INTEGER,
  column_type TEXT,
  updated_at TEXT,
  imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS production_cards (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL UNIQUE,
  column_source_id TEXT NOT NULL,
  position INTEGER,
  title TEXT NOT NULL,
  description_html TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  assignees_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT,
  updated_at TEXT,
  due_on TEXT,
  completed_at TEXT,
  completion_author_json TEXT,
  source_json TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  FOREIGN KEY (column_source_id) REFERENCES production_columns(source_id)
);
CREATE INDEX IF NOT EXISTS production_cards_column_position ON production_cards(column_source_id, position);

CREATE TABLE IF NOT EXISTS production_card_steps (
  source_id TEXT PRIMARY KEY,
  card_source_id TEXT NOT NULL,
  position INTEGER,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  assignees_json TEXT NOT NULL DEFAULT '[]',
  due_on TEXT,
  created_at TEXT,
  updated_at TEXT,
  source_json TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  FOREIGN KEY (card_source_id) REFERENCES production_cards(source_id)
);

CREATE TABLE IF NOT EXISTS production_comments (
  source_id TEXT PRIMARY KEY,
  card_source_id TEXT NOT NULL,
  body_html TEXT,
  author_json TEXT,
  created_at TEXT,
  updated_at TEXT,
  source_json TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  FOREIGN KEY (card_source_id) REFERENCES production_cards(source_id)
);

CREATE TABLE IF NOT EXISTS production_events (
  source_id TEXT PRIMARY KEY,
  card_source_id TEXT,
  occurred_at TEXT,
  event_type TEXT,
  creator_json TEXT,
  summary TEXT,
  source_json TEXT NOT NULL,
  imported_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS production_events_card_time ON production_events(card_source_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS production_attachments (
  source_id TEXT PRIMARY KEY,
  card_source_id TEXT NOT NULL,
  comment_source_id TEXT,
  filename TEXT NOT NULL,
  content_type TEXT,
  byte_size INTEGER,
  r2_key TEXT,
  source_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('stored', 'unavailable', 'failed', 'pending')),
  failure_reason TEXT,
  source_json TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  FOREIGN KEY (card_source_id) REFERENCES production_cards(source_id),
  FOREIGN KEY (comment_source_id) REFERENCES production_comments(source_id)
);
