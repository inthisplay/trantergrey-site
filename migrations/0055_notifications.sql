-- Inbox is durable; the request ledger is also the immutable sender audit.
CREATE TABLE notification_requests (
 actor_id TEXT NOT NULL, request_id TEXT NOT NULL, payload TEXT NOT NULL,
 created_at TEXT NOT NULL, PRIMARY KEY(actor_id,request_id)
);
CREATE TABLE team_notifications (
 id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, request_id TEXT NOT NULL,
 recipient TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
 href TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT,
 UNIQUE(actor_id,request_id,recipient)
);
CREATE INDEX notifications_inbox ON team_notifications(recipient,created_at DESC,id DESC);
CREATE TABLE push_subscriptions (
 id TEXT PRIMARY KEY, recipient TEXT NOT NULL, session_id TEXT NOT NULL,
 endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX push_recipient ON push_subscriptions(recipient);
CREATE TABLE notification_push_jobs (
 notification_id TEXT NOT NULL REFERENCES team_notifications(id) ON DELETE CASCADE,
 subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt INTEGER NOT NULL DEFAULT 0, lease TEXT, last_status INTEGER,
 PRIMARY KEY(notification_id,subscription_id)
);
CREATE INDEX push_pending ON notification_push_jobs(status,next_attempt);
