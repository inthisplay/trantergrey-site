CREATE TABLE client_user_preferences (
 user_email TEXT NOT NULL COLLATE NOCASE,
 client_id TEXT NOT NULL REFERENCES client_directory(id) ON DELETE CASCADE,
 pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
 color TEXT CHECK (color IS NULL OR color IN ('rose','amber','green','blue','purple')),
 PRIMARY KEY (user_email, client_id)
);

ALTER TABLE client_directory ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1));
