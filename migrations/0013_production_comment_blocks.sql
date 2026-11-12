-- Keep Editor.js blocks for programmatic reuse while retaining sanitized HTML
-- for immediate display and compatibility with existing local comments.
ALTER TABLE production_local_comments ADD COLUMN body_json TEXT;
