CREATE TABLE IF NOT EXISTS client_drive_pins (
  client_id TEXT NOT NULL REFERENCES client_directory(id) ON DELETE CASCADE,
  folder_id TEXT NOT NULL,
  root_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, folder_id)
);
