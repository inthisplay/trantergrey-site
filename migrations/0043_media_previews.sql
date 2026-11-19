CREATE TABLE media_previews (
 source_key TEXT NOT NULL, variant TEXT NOT NULL CHECK(variant IN ('thumb','preview','poster')),
 status TEXT NOT NULL CHECK(status IN ('processing','ready','failed','deferred')),
 output_key TEXT, content_type TEXT, byte_size INTEGER, source_bytes INTEGER,
 lease_token TEXT, retry_at TEXT, error TEXT, updated_at TEXT NOT NULL,
 PRIMARY KEY(source_key,variant)
);
CREATE TABLE media_transform_budget (month TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0);
