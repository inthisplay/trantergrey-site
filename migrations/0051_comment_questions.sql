ALTER TABLE production_local_comments ADD COLUMN is_question INTEGER NOT NULL DEFAULT 0;
ALTER TABLE production_local_comments ADD COLUMN question_resolved_at TEXT;
CREATE INDEX production_open_questions ON production_local_comments(card_source_id, created_at DESC, id DESC)
 WHERE is_question=1 AND question_resolved_at IS NULL AND deleted_at IS NULL;
