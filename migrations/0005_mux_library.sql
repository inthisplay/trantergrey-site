CREATE TABLE IF NOT EXISTS mux_asset_metadata (
  asset_id TEXT PRIMARY KEY,
  client TEXT,
  title TEXT,
  tags TEXT,
  status TEXT CHECK (status IS NULL OR status IN ('unreviewed', 'published', 'hidden')),
  thumbnail_time REAL,
  downloads_enabled INTEGER CHECK (downloads_enabled IS NULL OR downloads_enabled IN (0, 1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mux_video_projects (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mux_video_collections (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS mux_asset_metadata_status ON mux_asset_metadata (status);
CREATE INDEX IF NOT EXISTS mux_video_projects_updated_at ON mux_video_projects (updated_at DESC);
CREATE INDEX IF NOT EXISTS mux_video_collections_updated_at ON mux_video_collections (updated_at DESC);
