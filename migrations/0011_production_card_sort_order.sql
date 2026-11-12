-- Local ordering lets staff arrange the mirrored Basecamp cards without
-- changing the source archive or Basecamp itself.
ALTER TABLE production_card_overrides ADD COLUMN position REAL;
