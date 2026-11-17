import { adminResponse, type AdminEnvironment } from '../../_lib/admin';
import { invalidateMuxBrowseIndex } from '../../_lib/mux-library';

type Context = { request: Request; env: AdminEnvironment };

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env); if (denied) return denied;
  const body = await request.json().catch(() => null) as { oldName?: unknown; newName?: unknown; action?: unknown } | null;
  const oldName = typeof body?.oldName === 'string' ? body.oldName.trim() : '';
  const newName = typeof body?.newName === 'string' ? body.newName.trim().replace(/\s+/g, ' ') : '';
  if (!body || !newName || newName.length > 120 || body.action !== 'create' && !oldName) return Response.json({ error: 'Enter a client name up to 120 characters.' }, { status: 400 });
  if (body.action === 'create') {
    await env.TG_DATA.prepare('INSERT INTO client_directory (name, created_at) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET name = excluded.name').bind(newName, new Date().toISOString()).run();
    return Response.json({ name: newName }, { status: 201 });
  }
  if (oldName.toLocaleLowerCase() === newName.toLocaleLowerCase() && oldName === newName) return Response.json({ name: newName });
  const existing = await env.TG_DATA.prepare('SELECT name FROM client_directory WHERE name = ? COLLATE NOCASE').bind(oldName).first<{ name: string }>();
  if (!existing) return Response.json({ error: 'That client could not be found.' }, { status: 404 });
  const now = new Date().toISOString();
  await env.TG_DATA.batch([
    env.TG_DATA.prepare('UPDATE mux_asset_metadata SET client = ? WHERE client = ? COLLATE NOCASE').bind(newName, existing.name),
    env.TG_DATA.prepare('UPDATE production_card_overrides SET client = ? WHERE client = ? COLLATE NOCASE').bind(newName, existing.name),
    env.TG_DATA.prepare("UPDATE mux_video_projects SET value = json_set(value, '$.client', ?) WHERE json_valid(value) AND json_extract(value, '$.client') = ? COLLATE NOCASE").bind(newName, existing.name),
    env.TG_DATA.prepare('DELETE FROM client_directory WHERE name = ? COLLATE NOCASE').bind(existing.name),
    env.TG_DATA.prepare('INSERT INTO client_directory (name, created_at) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET name = excluded.name').bind(newName, now),
  ]);
  await invalidateMuxBrowseIndex(env);
  return Response.json({ name: newName });
}
