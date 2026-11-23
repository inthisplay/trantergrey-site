-- Shared presentation preferences stay separate from the imported Basecamp columns.
ALTER TABLE production_column_overrides ADD COLUMN color TEXT;
