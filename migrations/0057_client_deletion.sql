-- Preserve Drive trash retry/audit records after their client workspace is deleted.
CREATE TABLE client_drive_trash_requests_retained (
 actor_id TEXT NOT NULL, request_id TEXT NOT NULL, client_id TEXT NOT NULL,
 root_id TEXT NOT NULL, file_id TEXT NOT NULL, expected_version TEXT NOT NULL,
 file_name TEXT NOT NULL, activity_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','completed')),
 created_at TEXT NOT NULL, completed_at TEXT, PRIMARY KEY(actor_id,request_id)
);
INSERT INTO client_drive_trash_requests_retained SELECT * FROM client_drive_trash_requests;
DROP TABLE client_drive_trash_requests;
ALTER TABLE client_drive_trash_requests_retained RENAME TO client_drive_trash_requests;
CREATE TABLE client_deletion_requests (
 actor_id TEXT NOT NULL, request_id TEXT NOT NULL, client_id TEXT NOT NULL,
 payload TEXT NOT NULL, result_json TEXT NOT NULL, actor_name TEXT NOT NULL,
 created_at TEXT NOT NULL, PRIMARY KEY(actor_id,request_id)
);
