CREATE TABLE rolodex_people (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, birthday TEXT, ethnicity TEXT NOT NULL DEFAULT '', gender TEXT NOT NULL DEFAULT '',
 tags_json TEXT NOT NULL DEFAULT '[]', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 cover_media_id TEXT, archived_at TEXT, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX rolodex_people_name ON rolodex_people(deleted_at, archived_at, name COLLATE NOCASE);
CREATE TABLE rolodex_media (
 id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES rolodex_people(id), title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('upload','mux')),
 filename TEXT, content_type TEXT, byte_size INTEGER, r2_key TEXT, mux_asset_id TEXT, player_url TEXT, thumbnail_url TEXT,
 source_gallery_id TEXT, source_card_id TEXT, created_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX rolodex_media_person ON rolodex_media(person_id, deleted_at);
CREATE UNIQUE INDEX rolodex_media_source ON rolodex_media(person_id, source_gallery_id) WHERE deleted_at IS NULL AND source_gallery_id IS NOT NULL;
CREATE UNIQUE INDEX rolodex_media_mux ON rolodex_media(person_id, mux_asset_id) WHERE deleted_at IS NULL AND mux_asset_id IS NOT NULL;
ALTER TABLE production_gallery ADD COLUMN rolodex_person_id TEXT REFERENCES rolodex_people(id);
CREATE UNIQUE INDEX production_gallery_person ON production_gallery(card_source_id, rolodex_person_id) WHERE deleted_at IS NULL AND rolodex_person_id IS NOT NULL;
