CREATE TABLE client_drive_extra_folders (
  client_id TEXT NOT NULL REFERENCES client_directory(id),
  folder_id TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY(client_id,folder_id)
);
