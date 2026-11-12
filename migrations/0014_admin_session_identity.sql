-- Store the authenticated identity in the server-side session so local
-- comments are attributed by the trusted session, never by browser input.
ALTER TABLE admin_sessions ADD COLUMN user_name TEXT;
ALTER TABLE admin_sessions ADD COLUMN user_email TEXT;
