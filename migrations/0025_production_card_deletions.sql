-- Keep Basecamp source records intact while allowing a card to be removed
-- from the working Deck.
ALTER TABLE production_card_overrides ADD COLUMN deleted_at TEXT;
