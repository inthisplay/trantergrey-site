CREATE TABLE IF NOT EXISTS production_card_signals (
 card_source_id TEXT PRIMARY KEY REFERENCES production_cards(source_id),
 attention TEXT NOT NULL DEFAULT '',
 filming_on TEXT NOT NULL DEFAULT '',
 dismissed_at TEXT NOT NULL DEFAULT ''
);
