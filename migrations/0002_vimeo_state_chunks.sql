CREATE TABLE IF NOT EXISTS vimeo_state_chunks (
  state_key TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (state_key, chunk_index)
);
