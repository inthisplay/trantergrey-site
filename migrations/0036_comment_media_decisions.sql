CREATE TABLE production_comment_media_decisions (
  card_source_id TEXT NOT NULL REFERENCES production_cards(source_id),
  comment_key TEXT NOT NULL,
  media_url TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('highlight', 'reject')),
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  PRIMARY KEY (card_source_id, comment_key, media_url)
);
