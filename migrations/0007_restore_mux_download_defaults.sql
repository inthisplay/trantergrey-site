-- Before the metadata upsert fix, any edit could turn an unset download
-- preference into 0. Restore the default for pre-fix rows only.
UPDATE mux_asset_metadata
SET downloads_enabled = NULL
WHERE downloads_enabled = 0
  AND updated_at < '2026-11-09T19:12:50.000Z';
