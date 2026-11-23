CREATE TABLE client_activity (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES client_directory(id) ON DELETE CASCADE,
 occurred_at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
 category TEXT NOT NULL, summary TEXT NOT NULL
);
CREATE INDEX client_activity_time ON client_activity(client_id,occurred_at DESC,id DESC);
