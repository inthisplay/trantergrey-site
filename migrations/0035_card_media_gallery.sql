CREATE TABLE production_gallery (
  id TEXT PRIMARY KEY,
  card_source_id TEXT NOT NULL REFERENCES production_cards(source_id),
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  title TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  approved_at TEXT,
  approved_by TEXT,
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX production_gallery_card ON production_gallery(card_source_id, deleted_at, created_at);
