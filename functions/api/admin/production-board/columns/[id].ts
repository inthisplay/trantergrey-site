import { adminResponse, type AdminEnvironment } from '../../../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment; params: { id: string } };

export async function onRequestPatch({ request, env, params }: Context): Promise<Response> {
  const denied = await adminResponse(request, env); if (denied) return denied;
  const body = await request.json().catch(() => null) as { action?: unknown; name?: unknown; direction?: unknown } | null;
  const column = await env.TG_DATA.prepare('SELECT source_id, name FROM production_columns WHERE source_id = ?').bind(params.id).first<{ source_id: string; name: string }>();
  if (!column || !body || typeof body.action !== 'string') return Response.json({ error: 'Production column not found.' }, { status: 404 });
  const changedAt = new Date().toISOString();
  if (body.action === 'rename') {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
    if (!name) return Response.json({ error: 'Enter a column name.' }, { status: 400 });
    await env.TG_DATA.prepare(`INSERT INTO production_column_overrides (column_source_id, name, edited_at) VALUES (?, ?, ?)
      ON CONFLICT(column_source_id) DO UPDATE SET name = excluded.name, edited_at = excluded.edited_at`).bind(params.id, name, changedAt).run();
    return Response.json({ name });
  }
  if (body.action === 'archive') {
    await env.TG_DATA.prepare(`INSERT INTO production_column_overrides (column_source_id, archived, edited_at) VALUES (?, 1, ?)
      ON CONFLICT(column_source_id) DO UPDATE SET archived = 1, edited_at = excluded.edited_at`).bind(params.id, changedAt).run();
    return Response.json({ archived: true });
  }
  if (body.action === 'sort') {
    const direction = body.direction === 'oldest' ? 'ASC' : body.direction === 'newest' ? 'DESC' : '';
    if (!direction) return Response.json({ error: 'Choose oldest or newest first.' }, { status: 400 });
    const cards = await env.TG_DATA.prepare(`SELECT p.source_id AS sourceId FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id = p.source_id
      WHERE COALESCE(o.column_source_id, p.column_source_id) = ? ORDER BY p.created_at ${direction}, p.id ${direction}`).bind(params.id).all<{ sourceId: string }>();
    const statements = cards.results.map((card, index) => env.TG_DATA.prepare(`INSERT INTO production_card_overrides (card_source_id, column_source_id, position, edited_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(card_source_id) DO UPDATE SET column_source_id = excluded.column_source_id, position = excluded.position, edited_at = excluded.edited_at`).bind(card.sourceId, params.id, (index + 1) * 1000, changedAt));
    for (let start = 0; start < statements.length; start += 75) await env.TG_DATA.batch(statements.slice(start, start + 75));
    return Response.json({ sorted: direction });
  }
  return Response.json({ error: 'Choose a valid column action.' }, { status: 400 });
}
