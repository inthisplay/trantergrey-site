ALTER TABLE client_user_preferences ADD COLUMN sort_order INTEGER CHECK (sort_order IS NULL OR sort_order >= 0);
