import { clientActivity } from './client-activity';
import { createItem, changeItem, ClientItemError } from './client-items';
import type { ApiActor } from './internal-api';
import { adminSession } from './admin';
import type { AdminEnvironment } from './admin';
type Context = { request: Request; env: AdminEnvironment };
export async function clientHQResponse({ request, env }: Context, actor?: ApiActor) {
  const actorName = actor?.name;
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
        env.TG_DATA.prepare(`SELECT p.id,COALESCE(o.title,p.title) title FROM production_cards p JOIN production_card_overrides o ON o.card_source_id=p.source_id WHERE o.deleted_at IS NULL AND o.client=? COLLATE NOCASE ORDER BY p.id LIMIT 6 OFFSET ?`).bind(client.name,cardsOffset).all(),
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
  const session = actor ? null : await adminSession(request, env);
  const identity: ApiActor = actor || { type: 'user', id: session?.email || 'admin', name: session?.name || 'Admin', email: session?.email || null, scopes: new Set() };
  try {
    const fields: { title?: string; body?: string; assignee?: string; dueOn?: string; bodyFormat?: 'text' | 'html'; bodyJson?: string | null } = {};
    for (const [wire, key] of [['title','title'],['body','body'],['assignee','assignee'],['due_on','dueOn']] as const) {
      if (wire in b) { if (typeof b[wire] !== 'string') throw new ClientItemError(`Invalid ${wire}.`); fields[key] = b[wire] as string; }
    }
    if ('body_format' in b) { if (b.body_format !== 'html' && b.body_format !== 'text') throw new ClientItemError('Invalid body format.'); fields.bodyFormat = b.body_format; }
    if ('body_json' in b) { if (b.body_json !== null && typeof b.body_json !== 'string') throw new ClientItemError('Invalid note content.'); fields.bodyJson = b.body_json as string | null; }
    if (b.action !== undefined && b.action !== 'delete') throw new ClientItemError('Unknown action.');
    if (b.action === 'delete' && !id) throw new ClientItemError('Choose an item to delete.');
    if (id) {
      if ('completed' in b && ![0,1,true,false].includes(b.completed as number | boolean)) throw new ClientItemError('Invalid completion state.');
      const result = await changeItem(env, request, { ...fields, clientId: workspace, itemId: id, expectedUpdatedAt: typeof b.expectedUpdatedAt === 'string' ? b.expectedUpdatedAt : '',
        ...('completed' in b ? { completed: b.completed === 1 || b.completed === true } : {}), remove: b.action === 'delete' }, identity);
      return Response.json({ ok: true, ...result }, { headers });
    }
    if (b.kind !== 'todo' && b.kind !== 'note') throw new ClientItemError('Choose a note or to-do.');
    const result = await createItem(env, request, { ...fields, clientId: workspace, kind: b.kind, title: fields.title || '', requestId: typeof b.requestId === 'string' ? b.requestId : '' }, identity);
    return Response.json({ ok: true, ...result }, { headers });
  } catch (error) {
    if (error instanceof ClientItemError) return Response.json({ error: error.message }, { status: error.status, headers });
    throw error;
  }
}
