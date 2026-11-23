CREATE TABLE client_user_preferences_custom (
 user_email TEXT NOT NULL COLLATE NOCASE,
 client_id TEXT NOT NULL REFERENCES client_directory(id) ON DELETE CASCADE,
 pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
 color TEXT CHECK (color IS NULL OR (length(color)=7 AND substr(color,1,1)='#' AND substr(color,2) NOT GLOB '*[^0-9a-f]*')),
 PRIMARY KEY (user_email, client_id)
);
INSERT INTO client_user_preferences_custom(user_email,client_id,pinned,color)
 SELECT user_email,client_id,pinned,CASE color
  WHEN 'rose' THEN '#b95160' WHEN 'amber' THEN '#bb8a37'
  WHEN 'green' THEN '#578675' WHEN 'blue' THEN '#527fa8'
  WHEN 'purple' THEN '#9175ab' ELSE NULL END
 FROM client_user_preferences;
DROP TABLE client_user_preferences;
ALTER TABLE client_user_preferences_custom RENAME TO client_user_preferences;
