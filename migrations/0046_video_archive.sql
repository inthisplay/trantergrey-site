CREATE TABLE archive_videos (
 vimeo_id TEXT PRIMARY KEY, title TEXT NOT NULL, folder TEXT NOT NULL, client TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, release_at TEXT, duration REAL NOT NULL DEFAULT 0, description TEXT NOT NULL DEFAULT '',
 tags TEXT NOT NULL DEFAULT '[]', imported_at TEXT NOT NULL
);
CREATE TABLE archive_state (
 id TEXT PRIMARY KEY, active_scan TEXT, pending_scan TEXT, scan_status TEXT NOT NULL DEFAULT 'idle',
 checked_at TEXT, error TEXT, worker_seen_at TEXT, lease_owner TEXT, lease_until TEXT
);
INSERT INTO archive_state(id) VALUES('archive');
CREATE TABLE archive_scan_folders (
 scan_id TEXT NOT NULL, folder_id TEXT NOT NULL, path TEXT NOT NULL, page_token TEXT NOT NULL DEFAULT '', done INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(scan_id,folder_id)
);
CREATE TABLE archive_files (
 scan_id TEXT NOT NULL, file_id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(scan_id,file_id)
);
CREATE TABLE archive_links (
 vimeo_id TEXT PRIMARY KEY REFERENCES archive_videos(vimeo_id), file_id TEXT NOT NULL, manual INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL
);
CREATE TABLE archive_imports (
 id TEXT PRIMARY KEY, vimeo_id TEXT NOT NULL UNIQUE, file_id TEXT NOT NULL UNIQUE, title TEXT NOT NULL, client TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'queued', upload_id TEXT, upload_cipher TEXT, asset_id TEXT,
 byte_size INTEGER NOT NULL, bytes_done INTEGER NOT NULL DEFAULT 0, source_version TEXT,
 requested_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, error TEXT,
 failures INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT
);
