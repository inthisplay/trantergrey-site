CREATE TABLE client_drive_connection (
  id TEXT PRIMARY KEY CHECK(id='organization'),
  refresh_cipher TEXT NOT NULL,
  account_email TEXT NOT NULL,
  drive_id TEXT NOT NULL,
  connected_at TEXT NOT NULL,
  needs_reconnect INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE client_drive_oauth_states (
  state_hash TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL,
  verifier_cipher TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  destination TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
ALTER TABLE client_directory ADD COLUMN drive_managed_folder_id TEXT;
CREATE UNIQUE INDEX client_directory_drive_folder ON client_directory(drive_folder_id) WHERE drive_folder_id IS NOT NULL;
CREATE TABLE client_drive_locks (id TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at TEXT NOT NULL);
