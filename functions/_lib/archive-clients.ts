import type { AdminEnvironment } from './admin';

export async function editArchiveClients(env:AdminEnvironment, ids:string[], label:string, actor:string) {
  if(!Array.isArray(ids)||!ids.length||ids.length>10000||ids.some(id=>typeof id!=='string'||!/^\d{5,20}$/.test(id)))throw new Error('Choose archive videos first.');
  if(typeof label!=='string'||label.trim().length>120)throw new Error('Use a client label of at most 120 characters.');
  const id=crypto.randomUUID();
  // Capture and mutate in one transaction; CSV source client remains untouched.
  await env.TG_DATA.batch([
    env.TG_DATA.prepare(`INSERT INTO archive_client_edits(id,actor,created_at,label,previous)
      SELECT ?,?,?,?,json_group_array(json_object('id',vimeo_id,'label',archive_client,'revision',archive_client_revision))
      FROM archive_videos WHERE vimeo_id IN (SELECT value FROM json_each(?)) AND COALESCE(archive_client,client)<>?`)
      .bind(id,actor,new Date().toISOString(),label.trim(),JSON.stringify(ids),label.trim()),
    env.TG_DATA.prepare(`UPDATE archive_videos SET archive_client=?,archive_client_revision=? WHERE vimeo_id IN
      (SELECT json_extract(value,'$.id') FROM json_each((SELECT previous FROM archive_client_edits WHERE id=?)))`).bind(label.trim(),id,id),
  ]);
  const edit=await env.TG_DATA.prepare('SELECT json_array_length(previous) AS count FROM archive_client_edits WHERE id=?').bind(id).first<{count:number}>();
  return {id,count:edit?.count||0};
}

export async function undoArchiveClients(env:AdminEnvironment,id:string,actor:string) {
  const edit=await env.TG_DATA.prepare('SELECT previous FROM archive_client_edits WHERE id=? AND actor=? AND undone=0').bind(id,actor).first<{previous:string}>();
  if(!edit)throw new Error('This edit is no longer available to undo.');
  // A single conditional UPDATE makes undo all-or-nothing even if another team member edits a video.
  const result=await env.TG_DATA.prepare(`UPDATE archive_videos SET
    archive_client=(SELECT json_extract(value,'$.label') FROM json_each(?) WHERE json_extract(value,'$.id')=vimeo_id),
    archive_client_revision=(SELECT json_extract(value,'$.revision') FROM json_each(?) WHERE json_extract(value,'$.id')=vimeo_id)
    WHERE archive_client_revision=? AND NOT EXISTS (
      SELECT 1 FROM json_each(?) e LEFT JOIN archive_videos v ON v.vimeo_id=json_extract(e.value,'$.id')
      WHERE v.vimeo_id IS NULL OR v.archive_client_revision<>?
    )`).bind(edit.previous,edit.previous,id,edit.previous,id).run();
  const outcome=result as {meta?:{changes:number};changes?:number};
  const count=Number(outcome.meta?.changes ?? outcome.changes);
  if(!count)throw new Error('These videos changed since that edit. Undo was not applied.');
  await env.TG_DATA.prepare('UPDATE archive_client_edits SET undone=1 WHERE id=?').bind(id).run();
  return {count};
}
