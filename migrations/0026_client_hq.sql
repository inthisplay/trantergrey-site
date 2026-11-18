ALTER TABLE client_directory ADD COLUMN id TEXT;
ALTER TABLE client_directory ADD COLUMN drive_folder_id TEXT;
UPDATE client_directory SET id=lower(hex(randomblob(16))) WHERE id IS NULL;
CREATE UNIQUE INDEX client_directory_id ON client_directory(id);
CREATE TRIGGER client_directory_assign_id AFTER INSERT ON client_directory
WHEN NEW.id IS NULL BEGIN
  UPDATE client_directory SET id=lower(hex(randomblob(16))) WHERE name=NEW.name;
END;
CREATE TABLE client_workspace_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES client_directory(id),
  kind TEXT NOT NULL CHECK(kind IN ('todo','note')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  completed INTEGER NOT NULL DEFAULT 0,
  due_on TEXT NOT NULL DEFAULT '',
  assignee TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE INDEX client_workspace_items_parent ON client_workspace_items(workspace_id, kind);
