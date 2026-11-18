ALTER TABLE client_workspace_items ADD COLUMN body_format TEXT NOT NULL DEFAULT 'text' CHECK(body_format IN ('text','html'));
