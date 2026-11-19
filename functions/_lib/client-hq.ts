import { clientActivity } from './client-activity';
import { sanitizeClientNote, readClientNoteValue, clientNoteHtml } from '../../lib/client-note';
import type { AdminEnvironment } from './admin';
type Context = { request: Request; env: AdminEnvironment };
export async function clientHQResponse({ request, env }: Context, actorName?: string) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (request.method === 'GET') {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) {
      const rows = await env.TG_DATA.prepare(`SELECT w.*, (SELECT COUNT(*) FROM client_workspace_items i WHERE i.workspace_id=w.id AND kind='todo' AND completed=0) AS open_todos FROM client_directory w ORDER BY name COLLATE NOCASE`).all();
      return Response.json({ clients: rows.results }, { headers });
    }
    const client = await env.TG_DATA.prepare('SELECT * FROM client_directory WHERE id=?').bind(id).first<{id:string;name:string}>();
    if (!client) return Response.json({ error: 'Client not found.' }, { status: 404 });
    const url=new URL(request.url);
    if(url.searchParams.has('related')) {
      const pageOffset=(key:string)=>Math.max(0,Math.min(100000,Number.parseInt(url.searchParams.get(key) || '0',10) || 0));
      const cardsOffset=pageOffset('cardsOffset'),videosOffset=pageOffset('videosOffset');
      const [cards,videos]=await Promise.all([
        env.TG_DATA.prepare(`SELECT p.id,COALESCE(o.title,p.title) title FROM production_cards p JOIN production_card_overrides o ON o.card_source_id=p.source_id WHERE o.client=? COLLATE NOCASE ORDER BY p.id LIMIT 6 OFFSET ?`).bind(client.name,cardsOffset).all(),
        env.TG_DATA.prepare(`SELECT asset_id id,COALESCE(title,asset_id) title FROM mux_asset_metadata WHERE client=? COLLATE NOCASE
          UNION ALL SELECT b.asset_id id,b.title FROM mux_library_browse_assets b LEFT JOIN mux_asset_metadata m ON m.asset_id=b.asset_id
          WHERE b.refresh_id=(SELECT refresh_id FROM mux_library_browse_state WHERE id='library') AND b.client=? COLLATE NOCASE AND m.client IS NULL
          ORDER BY id LIMIT 6 OFFSET ?`).bind(client.name,client.name,videosOffset).all(),
      ]);
      return Response.json({cards:cards.results.slice(0,5),videos:videos.results.slice(0,5),cardsOffset,videosOffset,cardsNext:cards.results.length>5,videosNext:videos.results.length>5},{headers});
    }
    const items = await env.TG_DATA.prepare('SELECT * FROM client_workspace_items WHERE workspace_id=? ORDER BY updated_at DESC').bind(id).all();
    const members=await env.TG_DATA.prepare('SELECT nickname FROM admin_team_directory ORDER BY nickname COLLATE NOCASE').all<{nickname:string}>();
    const folders=await env.TG_DATA.prepare('SELECT folder_id,name FROM client_drive_extra_folders WHERE client_id=? ORDER BY name COLLATE NOCASE').bind(id).all();
    return Response.json({ client:{...client,extra_folders:folders.results}, items: items.results, members:members.results.map(m=>m.nickname) }, { headers });
  }
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return new Response(null, { status: 403 });
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!b) return Response.json({ error: 'Invalid request.' }, { status: 400 });
  const str = (key: string, max: number) => typeof b[key] === 'string' ? (b[key] as string).trim().slice(0,max) : '';
  const id = str('id',100), now = new Date().toISOString();
  if (b.action === 'archive-client') {
    if (!id || typeof b.archived !== 'boolean') return Response.json({error:'Choose a client and archive state.'},{status:400});
    if (!await env.TG_DATA.prepare('SELECT id FROM client_directory WHERE id=?').bind(id).first()) return Response.json({error:'Client not found.'},{status:404});
    await env.TG_DATA.batch([
      env.TG_DATA.prepare('UPDATE client_directory SET archived=? WHERE id=?').bind(b.archived?1:0,id),
      await clientActivity(request,env,id,b.archived?'client_archived':'client_restored',b.archived?'Archived the client.':'Restored the client.','management',actorName),
    ]);
    return Response.json({id,archived:b.archived},{headers});
  }
  if (b.action === 'client') {
    const name = str('name',120);
    if (!name) return Response.json({ error: 'Enter a client name.' }, { status: 400 });
    if (id) return Response.json({error:'Use client settings to rename a client.'},{status:400});
    else {
      const duplicate = await env.TG_DATA.prepare('SELECT id FROM client_directory WHERE name=?').bind(name).first();
      if (duplicate) return Response.json({error:'This client already has a workspace.'},{status:409});
      const newId = crypto.randomUUID();
      await env.TG_DATA.prepare('INSERT INTO client_directory(id,name,created_at) VALUES(?,?,?)').bind(newId,name,now).run();
      return Response.json({ id:newId }, {status:201,headers});
    }
  }
  const workspace = str('workspace_id',100);
  if (!await env.TG_DATA.prepare('SELECT id FROM client_directory WHERE id=?').bind(workspace).first()) return Response.json({error:'Client not found.'},{status:404});
  const before=id ? await env.TG_DATA.prepare('SELECT kind,title,completed FROM client_workspace_items WHERE id=? AND workspace_id=?').bind(id,workspace).first<{kind:string;title:string;completed:number}>() : null;
  if(id && !before)return Response.json({error:'Item not found.'},{status:404});
  let mutation;
  if (b.action === 'delete') {
    mutation=env.TG_DATA.prepare('DELETE FROM client_workspace_items WHERE id=? AND workspace_id=?').bind(id,workspace);
  } else {
    const title = str('title',240), kind = b.kind === 'note' ? 'note' : 'todo';
    if (!title) return Response.json({error:'Enter a title.'},{status:400});
    const due = str('due_on',10);
    let bodyFormat = kind === 'note' && b.body_format === 'html' ? 'html' : 'text';
    const rawBody = str('body',50000);
    let content = bodyFormat === 'html' ? sanitizeClientNote(rawBody) : rawBody;
    let bodyJson: string | null = null;
    if(kind === 'note' && typeof b.body_json === 'string') {
      try { readClientNoteValue(b.body_json); bodyJson=b.body_json; content=clientNoteHtml({body_json:bodyJson}); bodyFormat='html'; }
      catch(error) { return Response.json({error:error instanceof Error ? error.message : 'Invalid note content.'},{status:400}); }
    }
    const assignee=str('assignee',120);
    const existing=id ? await env.TG_DATA.prepare('SELECT assignee FROM client_workspace_items WHERE id=? AND workspace_id=?').bind(id,workspace).first<{assignee:string}>() : null;
    // Existing historical assignments may be retained during a completion toggle;
    // every new/changed assignment must come from the current team directory.
    if(assignee && assignee!==existing?.assignee){
      const team=await env.TG_DATA.prepare('SELECT nickname FROM admin_team_directory').all<{nickname:string}>();
      if(assignee.split(',').some(name=>!team.results.some(member=>member.nickname===name.trim())))return Response.json({error:'Choose assignees from the team directory.'},{status:400});
    }
    if(due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return Response.json({error:'Enter a valid due date.'},{status:400});
    if(id) mutation=env.TG_DATA.prepare(`UPDATE client_workspace_items SET title=?,body=?,body_format=?,body_json=?,
      completed_at=CASE WHEN kind!='todo' OR ?=0 THEN NULL WHEN completed=1 THEN COALESCE(completed_at,?) ELSE ? END,
      completed=?,due_on=?,assignee=?,updated_at=? WHERE id=? AND workspace_id=?`).bind(title,content,bodyFormat,bodyJson,b.completed === 1 ? 1 : 0,now,now,b.completed === 1 ? 1 : 0,due,str('assignee',120),now,id,workspace);
    else mutation=env.TG_DATA.prepare('INSERT INTO client_workspace_items(id,workspace_id,kind,title,body,body_format,body_json,completed,due_on,assignee,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),workspace,kind,title,content,bodyFormat,bodyJson,0,due,str('assignee',120),now);
  }
  const kind=before?.kind || (b.kind==='note'?'note':'todo');
  const action=b.action==='delete'?`${kind}_deleted`:!id?`${kind}_created`:kind==='todo' && before?.completed!==(b.completed===1?1:0)?b.completed===1?'todo_completed':'todo_reopened':`${kind}_updated`;
  await env.TG_DATA.batch([mutation!,await clientActivity(request,env,workspace,action,b.action==='delete'?before!.title:str('title',240),'updates',actorName)]);
  return Response.json({ok:true},{headers});
}
