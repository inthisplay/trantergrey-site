import { adminResponse, type AdminEnvironment } from '../../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment };

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env); if (denied) return denied;
  const body = await request.json().catch(() => null) as { columnSourceId?: unknown; title?: unknown; client?: unknown; assignedTo?: unknown; dueOn?: unknown; notes?: unknown } | null;
  const columnSourceId = typeof body?.columnSourceId === 'string' ? body.columnSourceId : '';
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 240) : '';
  const client = typeof body?.client === 'string' ? body.client.trim().slice(0, 120) : '';
  const assignedTo = typeof body?.assignedTo === 'string' ? body.assignedTo : '';
  const assignees = [...new Set(assignedTo.split(',').map((person) => person.trim()).filter(Boolean))];
  const dueOn = typeof body?.dueOn === 'string' ? body.dueOn.trim() : '';
  const notes = typeof body?.notes === 'string' ? body.notes : '';
  if (!columnSourceId || !title) return Response.json({ error: 'Choose a column and title.' }, { status: 400 });
  if (assignees.some((person) => person.length > 120) || !/^\d{4}-\d{2}-\d{2}$/.test(dueOn) && dueOn !== '' || notes.length > 100000) return Response.json({ error: 'Check the assignees, due date, and notes.' }, { status: 400 });
  const column = await env.TG_DATA.prepare('SELECT source_id FROM production_columns WHERE source_id = ?').bind(columnSourceId).first();
  if (!column) return Response.json({ error: 'Production column not found.' }, { status: 404 });
  const now = new Date().toISOString(); const sourceId = `local-${crypto.randomUUID()}`; const id = `local-card-${crypto.randomUUID()}`;
  const last = await env.TG_DATA.prepare(`SELECT MAX(COALESCE(o.position, p.position)) AS position FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id = p.source_id WHERE COALESCE(o.column_source_id, p.column_source_id) = ?`).bind(columnSourceId).first<{ position: number | null }>();
  const position = (last?.position ?? 0) + 1000;
  const notesHtml = notes ? escapeHtml(notes).replace(/\r?\n/g, '<br>') : null;
  await env.TG_DATA.batch([
    env.TG_DATA.prepare(`INSERT INTO production_cards (id, source_id, column_source_id, position, title, description_html, archived, assignees_json, created_at, updated_at, source_json, imported_at)
      VALUES (?, ?, ?, ?, ?, '', 0, '[]', ?, ?, ?, ?)`).bind(id, sourceId, columnSourceId, position, title, now, now, JSON.stringify({ local: true }), now),
    env.TG_DATA.prepare(`INSERT INTO production_card_overrides (card_source_id, title, notes_html, client, assignees_json, due_on, column_source_id, archived, edited_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`)
      .bind(sourceId, title, notesHtml, client, JSON.stringify(assignees), dueOn, columnSourceId, now),
  ]);
  return Response.json({ id }, { status: 201 });
}
