-- Local column administration stays separate from the Basecamp mirror.
CREATE TABLE IF NOT EXISTS production_column_overrides (
  column_source_id TEXT PRIMARY KEY,
  name TEXT,
  archived INTEGER CHECK (archived IN (0, 1)),
  edited_at TEXT NOT NULL,
  FOREIGN KEY (column_source_id) REFERENCES production_columns(source_id)
);
