-- The board renders a comment count beside every card. These indexes make the
-- aggregate counts seek directly to each card instead of scanning both comment
-- tables for every card on the board.
CREATE INDEX IF NOT EXISTS production_comments_card_source_id
  ON production_comments(card_source_id);

CREATE INDEX IF NOT EXISTS production_local_comments_card_source_id
  ON production_local_comments(card_source_id);
