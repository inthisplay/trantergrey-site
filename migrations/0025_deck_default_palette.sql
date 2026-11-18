-- Carry the approved Deck palette into existing installations, preserving any
-- custom colors, names, archive flags, and card data already stored there.
INSERT INTO production_column_overrides (column_source_id, color, edited_at, edited_by)
SELECT c.source_id,
  CASE lower(trim(COALESCE(o.name, c.name)))
    WHEN 'triage' THEN '#e6e6e6'
    WHEN 'not now' THEN '#e6d9e7'
    WHEN 'pre prod' THEN '#c7dee1'
    WHEN 'in progress' THEN '#f9f1d2'
    WHEN 'edit' THEN '#edd9db'
    WHEN 'done' THEN '#d7eadb'
  END,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'Deck palette setup'
FROM production_columns c
LEFT JOIN production_column_overrides o ON o.column_source_id = c.source_id
WHERE lower(trim(COALESCE(o.name, c.name))) IN ('triage','not now','pre prod','in progress','edit','done')
  AND o.color IS NULL
ON CONFLICT(column_source_id) DO UPDATE SET color = excluded.color,
  edited_at = excluded.edited_at, edited_by = excluded.edited_by
WHERE production_column_overrides.color IS NULL;
