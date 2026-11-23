ALTER TABLE client_workspace_items ADD COLUMN completed_at TEXT;
-- Historical completion times weren't recorded. Start their retention window now.
UPDATE client_workspace_items SET completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE kind='todo' AND completed=1;
