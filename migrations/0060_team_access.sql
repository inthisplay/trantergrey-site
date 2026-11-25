CREATE TABLE IF NOT EXISTS team_access (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  updated_at TEXT NOT NULL
);
-- Preserve the existing named team and currently signed-in Workspace users.
INSERT OR IGNORE INTO team_access(email,active,updated_at)
SELECT lower(email),1,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM admin_team_directory;
INSERT OR IGNORE INTO team_access(email,active,updated_at)
SELECT DISTINCT lower(user_email),1,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM admin_sessions
WHERE expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND lower(user_email) LIKE '%@trantergrey.com';
INSERT OR IGNORE INTO team_access VALUES('tyler@trantergrey.com',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT OR IGNORE INTO admin_team_directory(email,nickname,created_at,updated_at)
SELECT email,substr(email,1,instr(email,'@')-1),updated_at,updated_at FROM team_access;
