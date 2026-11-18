-- A durable, indexed feed across all Deck write paths. Source tables remain intact.
-- Unknown source dates stay empty and sort after dated events, never at import time.
ALTER TABLE production_column_overrides ADD COLUMN edited_by TEXT NOT NULL DEFAULT 'Admin';
CREATE TABLE production_deck_history (
  id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  card_source_id TEXT,
  column_source_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('updates','moves','management')),
  summary TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  details_json TEXT NOT NULL DEFAULT '{}',
  redacted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX production_deck_history_time ON production_deck_history(occurred_at DESC,id DESC);
CREATE INDEX production_deck_history_category_time ON production_deck_history(category,occurred_at DESC,id DESC);
CREATE INDEX production_deck_history_source ON production_deck_history(source_kind,source_id);

INSERT OR IGNORE INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) SELECT 'created:'||s.source_id, 'created', s.source_id, s.source_id, s.column_source_id, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',s.created_at),''), COALESCE(json_extract(s.source_json,'$.createdBy'),json_extract(s.source_json,'$.creator.name'),'Unknown author'), 'card_created', 'updates', '', COALESCE('',''), json_object('title',s.title), 0 FROM production_cards s WHERE 1;
CREATE TRIGGER deck_history_created_insert AFTER INSERT ON production_cards WHEN 1 BEGIN
 INSERT OR IGNORE INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) VALUES ('created:'||NEW.source_id, 'created', NEW.source_id, NEW.source_id, NEW.column_source_id, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at),''), COALESCE(json_extract(NEW.source_json,'$.createdBy'),json_extract(NEW.source_json,'$.creator.name'),'Unknown author'), 'card_created', 'updates', '', COALESCE('',''), json_object('title',NEW.title), 0);
END;

INSERT OR IGNORE INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) SELECT 'import-comment:'||s.source_id, 'import-comment', s.source_id, s.card_source_id, NULL, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',s.created_at),''), COALESCE(json_extract(s.author_json,'$.name'),'Unknown author'), 'comment_added', 'updates', '', COALESCE(s.body_html,''), '{}', 0 FROM production_comments s WHERE 1;
CREATE TRIGGER deck_history_import_comment_insert AFTER INSERT ON production_comments WHEN 1 BEGIN
 INSERT OR IGNORE INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) VALUES ('import-comment:'||NEW.source_id, 'import-comment', NEW.source_id, NEW.card_source_id, NULL, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at),''), COALESCE(json_extract(NEW.author_json,'$.name'),'Unknown author'), 'comment_added', 'updates', '', COALESCE(NEW.body_html,''), '{}', 0);
END;

INSERT OR IGNORE INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) SELECT 'import-event:'||s.source_id, 'import-event', s.source_id, s.card_source_id, NULL, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',s.occurred_at),''), COALESCE(json_extract(s.creator_json,'$.name'),'Unknown author'), 'imported_event', CASE WHEN s.event_type='card-move' THEN 'moves' ELSE 'updates' END, COALESCE(s.summary,s.event_type,'Imported event'), COALESCE('',''), json_object('eventType',s.event_type), 0 FROM production_events s WHERE 1;
CREATE TRIGGER deck_history_import_event_insert AFTER INSERT ON production_events WHEN 1 BEGIN
 INSERT OR IGNORE INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) VALUES ('import-event:'||NEW.source_id, 'import-event', NEW.source_id, NEW.card_source_id, NULL, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',NEW.occurred_at),''), COALESCE(json_extract(NEW.creator_json,'$.name'),'Unknown author'), 'imported_event', CASE WHEN NEW.event_type='card-move' THEN 'moves' ELSE 'updates' END, COALESCE(NEW.summary,NEW.event_type,'Imported event'), COALESCE('',''), json_object('eventType',NEW.event_type), 0);
END;

INSERT OR IGNORE INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) SELECT 'edit:'||s.id, 'edit', s.id, s.card_source_id, json_extract(s.after_json,'$.columnSourceId'), COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',s.changed_at),''), s.actor, CASE WHEN json_extract(s.before_json,'$.columnSourceId') IS NOT json_extract(s.after_json,'$.columnSourceId') THEN 'card_moved' WHEN json_extract(s.after_json,'$.position') IS NOT NULL THEN 'card_reordered' ELSE 'card_updated' END, CASE WHEN json_extract(s.before_json,'$.columnSourceId') IS NOT json_extract(s.after_json,'$.columnSourceId') OR json_extract(s.after_json,'$.position') IS NOT NULL THEN 'moves' ELSE 'updates' END, '', COALESCE(COALESCE(json_extract(s.after_json,'$.notes'),''),''), json_object('before',json(s.before_json),'after',json(s.after_json)), 0 FROM production_card_edit_log s WHERE 1;
CREATE TRIGGER deck_history_edit_insert AFTER INSERT ON production_card_edit_log WHEN 1 BEGIN
 INSERT OR IGNORE INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) VALUES ('edit:'||NEW.id, 'edit', NEW.id, NEW.card_source_id, json_extract(NEW.after_json,'$.columnSourceId'), COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',NEW.changed_at),''), NEW.actor, CASE WHEN json_extract(NEW.before_json,'$.columnSourceId') IS NOT json_extract(NEW.after_json,'$.columnSourceId') THEN 'card_moved' WHEN json_extract(NEW.after_json,'$.position') IS NOT NULL THEN 'card_reordered' ELSE 'card_updated' END, CASE WHEN json_extract(NEW.before_json,'$.columnSourceId') IS NOT json_extract(NEW.after_json,'$.columnSourceId') OR json_extract(NEW.after_json,'$.position') IS NOT NULL THEN 'moves' ELSE 'updates' END, '', COALESCE(COALESCE(json_extract(NEW.after_json,'$.notes'),''),''), json_object('before',json(NEW.before_json),'after',json(NEW.after_json)), 0);
END;

INSERT OR IGNORE INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) SELECT 'local-comment:'||s.id, 'local-comment', s.id, s.card_source_id, NULL, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',s.created_at),''), s.author_name, 'comment_added', 'updates', '', COALESCE(CASE WHEN s.deleted_at IS NULL THEN s.body_html ELSE '' END,''), '{}', CASE WHEN s.deleted_at IS NULL THEN 0 ELSE 1 END FROM production_local_comments s WHERE 1;
CREATE TRIGGER deck_history_local_comment_insert AFTER INSERT ON production_local_comments WHEN 1 BEGIN
 INSERT OR IGNORE INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) VALUES ('local-comment:'||NEW.id, 'local-comment', NEW.id, NEW.card_source_id, NULL, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at),''), NEW.author_name, 'comment_added', 'updates', '', COALESCE(CASE WHEN NEW.deleted_at IS NULL THEN NEW.body_html ELSE '' END,''), '{}', CASE WHEN NEW.deleted_at IS NULL THEN 0 ELSE 1 END);
END;

INSERT OR IGNORE INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) SELECT 'api:'||s.id, 'api', s.id, (SELECT source_id FROM production_cards WHERE id=s.card_id), NULL, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',s.occurred_at),''), s.actor_id, s.event_type, 'updates', '', COALESCE('',''), s.details_json, 0 FROM production_card_activity s WHERE 1;
CREATE TRIGGER deck_history_api_insert AFTER INSERT ON production_card_activity WHEN 1 BEGIN
 INSERT OR IGNORE INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) VALUES ('api:'||NEW.id, 'api', NEW.id, (SELECT source_id FROM production_cards WHERE id=NEW.card_id), NULL, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',NEW.occurred_at),''), NEW.actor_id, NEW.event_type, 'updates', '', COALESCE('',''), NEW.details_json, 0);
END;

INSERT OR IGNORE INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) SELECT 'attachment:'||s.source_id, 'attachment', s.source_id, s.card_source_id, NULL, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',COALESCE(json_extract(s.source_json,'$.uploadedAt'),s.imported_at)),''), COALESCE(json_extract(s.source_json,'$.uploadedBy'),'Unknown author'), 'attachment_added', 'updates', '', COALESCE('',''), json_object('attachmentId',s.source_id,'filename',s.filename,'contentType',s.content_type), 0 FROM production_attachments s WHERE s.source_id LIKE 'local-attachment-%' AND s.status='stored';
CREATE TRIGGER deck_history_attachment_insert AFTER INSERT ON production_attachments WHEN NEW.source_id LIKE 'local-attachment-%' AND NEW.status='stored' BEGIN
 INSERT OR IGNORE INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) VALUES ('attachment:'||NEW.source_id, 'attachment', NEW.source_id, NEW.card_source_id, NULL, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',COALESCE(json_extract(NEW.source_json,'$.uploadedAt'),NEW.imported_at)),''), COALESCE(json_extract(NEW.source_json,'$.uploadedBy'),'Unknown author'), 'attachment_added', 'updates', '', COALESCE('',''), json_object('attachmentId',NEW.source_id,'filename',NEW.filename,'contentType',NEW.content_type), 0);
END;


-- Preserve each future comment revision; deleting a comment redacts its old bodies too.
CREATE TRIGGER deck_history_comment_edit AFTER UPDATE OF body_html,body_json ON production_local_comments
WHEN NEW.deleted_at IS NULL AND (OLD.body_html IS NOT NEW.body_html OR OLD.body_json IS NOT NEW.body_json) BEGIN
 INSERT INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) VALUES ('comment-edit:'||lower(hex(randomblob(16))),'local-comment',NEW.id,NEW.card_source_id,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),NEW.author_name,'comment_edited','updates','',NEW.body_html,'{}',0);
END;
CREATE TRIGGER deck_history_comment_delete AFTER UPDATE OF deleted_at ON production_local_comments
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL BEGIN
 UPDATE production_deck_history SET body_html='',details_json='{}',redacted=1 WHERE source_kind='local-comment' AND source_id=NEW.id;
 INSERT INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) VALUES ('comment-delete:'||NEW.id,'local-comment',NEW.id,NEW.card_source_id,NULL,COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',NEW.deleted_at),''),COALESCE(NEW.deleted_by_name,NEW.author_name),'comment_deleted','updates','','','{}',0);
END;
INSERT OR IGNORE INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) SELECT 'comment-delete:'||id,'local-comment',id,card_source_id,NULL,COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',deleted_at),''),COALESCE(deleted_by_name,author_name),'comment_deleted','updates','','','{}',0 FROM production_local_comments WHERE deleted_at IS NOT NULL;

CREATE TRIGGER deck_history_column_color_insert AFTER INSERT ON production_column_overrides WHEN NEW.color IS NOT NULL BEGIN
 INSERT INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) VALUES ('column:'||lower(hex(randomblob(16))),'column',NEW.column_source_id,NULL,NEW.column_source_id,COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',NEW.edited_at),''),NEW.edited_by,'column_color_changed','management','','',json_object('before',NULL,'after',NEW.color),0);
END;
CREATE TRIGGER deck_history_column_color_update AFTER UPDATE ON production_column_overrides WHEN OLD.color IS NOT NEW.color BEGIN
 INSERT INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) VALUES ('column:'||lower(hex(randomblob(16))),'column',NEW.column_source_id,NULL,NEW.column_source_id,COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',NEW.edited_at),''),NEW.edited_by,'column_color_changed','management','','',json_object('before',OLD.color,'after',NEW.color),0);
END;
CREATE TRIGGER deck_history_column_name_insert AFTER INSERT ON production_column_overrides WHEN NEW.name IS NOT NULL BEGIN
 INSERT INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) VALUES ('column:'||lower(hex(randomblob(16))),'column',NEW.column_source_id,NULL,NEW.column_source_id,COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',NEW.edited_at),''),NEW.edited_by,'column_renamed','management','','',json_object('before',NULL,'after',NEW.name),0);
END;
CREATE TRIGGER deck_history_column_name_update AFTER UPDATE ON production_column_overrides WHEN OLD.name IS NOT NEW.name BEGIN
 INSERT INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) VALUES ('column:'||lower(hex(randomblob(16))),'column',NEW.column_source_id,NULL,NEW.column_source_id,COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',NEW.edited_at),''),NEW.edited_by,'column_renamed','management','','',json_object('before',OLD.name,'after',NEW.name),0);
END;
CREATE TRIGGER deck_history_column_archived_insert AFTER INSERT ON production_column_overrides WHEN NEW.archived IS NOT NULL BEGIN
 INSERT INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) VALUES ('column:'||lower(hex(randomblob(16))),'column',NEW.column_source_id,NULL,NEW.column_source_id,COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',NEW.edited_at),''),NEW.edited_by,'column_archived','management','','',json_object('before',NULL,'after',NEW.archived),0);
END;
CREATE TRIGGER deck_history_column_archived_update AFTER UPDATE ON production_column_overrides WHEN OLD.archived IS NOT NEW.archived BEGIN
 INSERT INTO production_deck_history (id,source_kind,source_id,card_source_id,column_source_id,occurred_at,actor,action,category,summary,body_html,details_json,redacted) VALUES ('column:'||lower(hex(randomblob(16))),'column',NEW.column_source_id,NULL,NEW.column_source_id,COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',NEW.edited_at),''),NEW.edited_by,'column_archived','management','','',json_object('before',OLD.archived,'after',NEW.archived),0);
END;
