-- Editable production fields stay local to TranterGrey and never alter the
-- imported Basecamp source record.
ALTER TABLE production_card_overrides ADD COLUMN client TEXT;
ALTER TABLE production_card_overrides ADD COLUMN assignees_json TEXT;
ALTER TABLE production_card_overrides ADD COLUMN due_on TEXT;
ALTER TABLE production_card_overrides ADD COLUMN notes_html TEXT;

CREATE TABLE IF NOT EXISTS production_local_comments (
  id TEXT PRIMARY KEY,
  card_source_id TEXT NOT NULL,
  body_html TEXT NOT NULL,
  author_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (card_source_id) REFERENCES production_cards(source_id)
);
CREATE INDEX IF NOT EXISTS production_local_comments_card_time
  ON production_local_comments(card_source_id, created_at ASC);
