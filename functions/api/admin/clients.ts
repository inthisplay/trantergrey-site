import { adminResponse, type AdminEnvironment } from '../../_lib/admin';
import { invalidateMuxBrowseIndex } from '../../_lib/mux-library';

type Context = { request: Request; env: AdminEnvironment };

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env); if (denied) return denied;
  const body = await request.json().catch(() => null) as { oldName?: unknown; newName?: unknown; action?: unknown } | null;
  const oldName = typeof body?.oldName === 'string' ? body.oldName.trim() : '';
  const newName = typeof body?.newName === 'string' ? body.newName.trim().replace(/\s+/g, ' ') : '';
  if (!body || (body.action === 'delete' ? !oldName : !newName || newName.length > 120 || body.action !== 'create' && !oldName)) return Response.json({ error: 'Enter a client name up to 120 characters.' }, { status: 400 });
  if (body.action === 'create') {
    await env.TG_DATA.prepare('INSERT INTO client_directory (name, created_at) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET name = excluded.name').bind(newName, new Date().toISOString()).run();
    return Response.json({ name: newName }, { status: 201 });
  }
  if (body.action === 'delete') {
    const used = await env.TG_DATA.prepare(`SELECT id FROM client_directory c WHERE name=? COLLATE NOCASE AND (drive_folder_id IS NOT NULL OR EXISTS(SELECT 1 FROM client_workspace_items i WHERE i.workspace_id=c.id) OR EXISTS(SELECT 1 FROM mux_asset_metadata m WHERE m.client=c.name COLLATE NOCASE) OR EXISTS(SELECT 1 FROM production_card_overrides p WHERE p.client=c.name COLLATE NOCASE) OR EXISTS(SELECT 1 FROM mux_video_projects v WHERE json_valid(v.value) AND json_extract(v.value,'$.client')=c.name COLLATE NOCASE))`).bind(oldName).first();
    if(used) return Response.json({error:'This client has workspace content or linked work and cannot be deleted.'},{status:409});
    const result = await env.TG_DATA.prepare('DELETE FROM client_directory WHERE name = ? COLLATE NOCASE').bind(oldName).run() as { meta?: { changes?: number } };
    if (!result.meta?.changes) return Response.json({ error: 'That client could not be found.' }, { status: 404 });
    return Response.json({ deleted: oldName });
  }
  if (oldName.toLocaleLowerCase() === newName.toLocaleLowerCase() && oldName === newName) return Response.json({ name: newName });
  const existing = await env.TG_DATA.prepare('SELECT name FROM client_directory WHERE name = ? COLLATE NOCASE').bind(oldName).first<{ name: string }>();
  if (!existing) return Response.json({ error: 'That client could not be found.' }, { status: 404 });
  const duplicate = await env.TG_DATA.prepare('SELECT name FROM client_directory WHERE name=? COLLATE NOCASE AND name != ? COLLATE NOCASE').bind(newName,existing.name).first();
  if(duplicate) return Response.json({error:'That client name already exists.'},{status:409});
  await env.TG_DATA.batch([
    env.TG_DATA.prepare(`INSERT INTO mux_asset_metadata(asset_id,client,updated_at)
      SELECT asset_id,?,? FROM mux_library_browse_assets WHERE refresh_id=(SELECT refresh_id FROM mux_library_browse_state WHERE id='library') AND client=? COLLATE NOCASE
      ON CONFLICT(asset_id) DO UPDATE SET client=excluded.client,updated_at=excluded.updated_at`).bind(newName,new Date().toISOString(),existing.name),
    env.TG_DATA.prepare('UPDATE mux_asset_metadata SET client = ? WHERE client = ? COLLATE NOCASE').bind(newName, existing.name),
    env.TG_DATA.prepare('UPDATE production_card_overrides SET client = ? WHERE client = ? COLLATE NOCASE').bind(newName, existing.name),
    env.TG_DATA.prepare("UPDATE mux_video_projects SET value = json_set(value, '$.client', ?) WHERE json_valid(value) AND json_extract(value, '$.client') = ? COLLATE NOCASE").bind(newName, existing.name),
    env.TG_DATA.prepare('UPDATE client_directory SET name=? WHERE name=? COLLATE NOCASE').bind(newName,existing.name),
  ]);
  await invalidateMuxBrowseIndex(env);
  return Response.json({ name: newName });
}
