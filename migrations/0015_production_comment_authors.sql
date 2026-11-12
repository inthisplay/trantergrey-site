-- Associate new local comments with the signed-in account that posted them.
ALTER TABLE production_local_comments ADD COLUMN author_email TEXT;
ALTER TABLE production_local_comments ADD COLUMN deleted_at TEXT;
ALTER TABLE production_local_comments ADD COLUMN deleted_by_name TEXT;
