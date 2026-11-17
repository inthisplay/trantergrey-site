CREATE TABLE IF NOT EXISTS admin_team_directory (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  nickname TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_team_directory_nickname
  ON admin_team_directory (nickname COLLATE NOCASE);

INSERT OR IGNORE INTO admin_team_directory (email, nickname, created_at, updated_at)
SELECT lower(trim(user_email)), trim(user_name), datetime('now'), datetime('now')
FROM admin_sessions
WHERE user_email IS NOT NULL
  AND trim(user_email) != ''
  AND lower(trim(user_email)) LIKE '%@trantergrey.com'
  AND user_name IS NOT NULL
  AND trim(user_name) != '';
