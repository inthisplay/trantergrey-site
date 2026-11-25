CREATE TABLE client_drive_trash_requests (
 actor_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 client_id TEXT NOT NULL REFERENCES client_directory(id),
 root_id TEXT NOT NULL,
 file_id TEXT NOT NULL,
 expected_version TEXT NOT NULL,
 file_name TEXT NOT NULL,
 activity_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','completed')),
 created_at TEXT NOT NULL,
 completed_at TEXT,
 PRIMARY KEY(actor_id, request_id)
);
