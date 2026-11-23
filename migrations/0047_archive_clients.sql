-- Archive labels never update the source client or shared client directory.
ALTER TABLE archive_videos ADD COLUMN archive_client TEXT;
ALTER TABLE archive_videos ADD COLUMN archive_client_revision TEXT NOT NULL DEFAULT '';
CREATE TABLE archive_client_edits (
 id TEXT PRIMARY KEY, actor TEXT NOT NULL, created_at TEXT NOT NULL,
 label TEXT NOT NULL, previous TEXT NOT NULL, undone INTEGER NOT NULL DEFAULT 0
);
