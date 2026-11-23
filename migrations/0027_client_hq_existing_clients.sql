-- Include clients derived from the existing Mux catalog and ratio sets in
-- the same master directory. The ID trigger from 0026 covers these rows.
INSERT OR IGNORE INTO client_directory(name,created_at)
SELECT DISTINCT TRIM(client),CURRENT_TIMESTAMP FROM mux_library_browse_assets
WHERE refresh_id=(SELECT refresh_id FROM mux_library_browse_state WHERE id='library')
  AND TRIM(client)!='' AND client!='Unassigned' COLLATE NOCASE;
INSERT OR IGNORE INTO client_directory(name,created_at)
SELECT DISTINCT TRIM(json_extract(value,'$.client')),CURRENT_TIMESTAMP FROM mux_video_projects
WHERE json_valid(value) AND json_extract(value,'$.client') IS NOT NULL
  AND TRIM(json_extract(value,'$.client'))!='';
