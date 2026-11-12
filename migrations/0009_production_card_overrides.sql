-- Local production work intentionally lives separately from the immutable
-- Basecamp mirror. An import can therefore refresh historical data without
-- overwriting staff edits made in the TranterGrey board.
CREATE TABLE IF NOT EXISTS production_card_overrides (
  card_source_id TEXT PRIMARY KEY,
  title TEXT,
  description_html TEXT,
  column_source_id TEXT,
  archived INTEGER CHECK (archived IN (0, 1)),
  edited_at TEXT NOT NULL,
  FOREIGN KEY (card_source_id) REFERENCES production_cards(source_id),
  FOREIGN KEY (column_source_id) REFERENCES production_columns(source_id)
);

CREATE TABLE IF NOT EXISTS production_card_edit_log (
  id TEXT PRIMARY KEY,
  card_source_id TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  FOREIGN KEY (card_source_id) REFERENCES production_cards(source_id)
);
CREATE INDEX IF NOT EXISTS production_card_edit_log_card_time
  ON production_card_edit_log(card_source_id, changed_at DESC);
