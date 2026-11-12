import { adminResponse, type AdminEnvironment } from '../../../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment; params: { id: string } };

export async function onRequestPost({ request, env, params }: Context): Promise<Response> {
  const denied = await adminResponse(request, env); if (denied) return denied;
  const body = await request.json().catch(() => null) as { columnSourceId?: unknown; beforeCardId?: unknown } | null;
  if (!body || typeof body.columnSourceId !== 'string' || !body.columnSourceId) return Response.json({ error: 'Choose a valid board column.' }, { status: 400 });
  if (body.beforeCardId !== undefined && typeof body.beforeCardId !== 'string') return Response.json({ error: 'Choose a valid card placement.' }, { status: 400 });

  const card = await env.TG_DATA.prepare(`SELECT p.source_id AS sourceId, COALESCE(o.column_source_id, p.column_source_id) AS columnSourceId, COALESCE(o.position, p.position) AS position
    FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id = p.source_id WHERE p.id = ?`).bind(params.id).first<{ sourceId: string; columnSourceId: string; position: number | null }>();
  if (!card) return Response.json({ error: 'Production card not found.' }, { status: 404 });
  const column = await env.TG_DATA.prepare('SELECT source_id FROM production_columns WHERE source_id = ?').bind(body.columnSourceId).first();
  if (!column) return Response.json({ error: 'Choose a valid board column.' }, { status: 400 });
  const siblings = await env.TG_DATA.prepare(`SELECT p.id, p.source_id AS sourceId, COALESCE(o.position, p.position) AS position
    FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id = p.source_id
    WHERE COALESCE(o.column_source_id, p.column_source_id) = ? AND p.id != ?
    ORDER BY CASE WHEN COALESCE(o.position, p.position) IS NULL THEN 1 ELSE 0 END, COALESCE(o.position, p.position), p.created_at`).bind(body.columnSourceId, params.id).all<{ id: string; sourceId: string; position: number | null }>();
  const cards = siblings.results;
  const beforeIndex = body.beforeCardId ? cards.findIndex((sibling) => sibling.id === body.beforeCardId) : -1;
  if (body.beforeCardId && beforeIndex < 0) return Response.json({ error: 'Choose a valid card placement.' }, { status: 400 });
  const placementIndex = beforeIndex < 0 ? cards.length : beforeIndex;
  // The source export has many cards without a position. Reindex this destination
  // column so its saved order exactly matches the visible insertion point.
  const orderedCards = [...cards];
  orderedCards.splice(placementIndex, 0, { id: params.id, sourceId: card.sourceId, position: null });
  const position = (placementIndex + 1) * 1000;
  if (card.columnSourceId === body.columnSourceId && card.position === position) return Response.json({ moved: false, columnSourceId: card.columnSourceId, position });

  const changedAt = new Date().toISOString();
  const statements = [
    ...orderedCards.map((item, index) => env.TG_DATA.prepare(`INSERT INTO production_card_overrides (card_source_id, column_source_id, position, edited_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(card_source_id) DO UPDATE SET column_source_id = excluded.column_source_id, position = excluded.position, edited_at = excluded.edited_at`)
      .bind(item.sourceId, body.columnSourceId, (index + 1) * 1000, changedAt)),
    env.TG_DATA.prepare('INSERT INTO production_card_edit_log (id, card_source_id, changed_at, actor, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), card.sourceId, changedAt, 'Admin', JSON.stringify({ columnSourceId: card.columnSourceId, position: card.position }), JSON.stringify({ columnSourceId: body.columnSourceId, position })),
  ];
  for (let start = 0; start < statements.length; start += 75) await env.TG_DATA.batch(statements.slice(start, start + 75));
  return Response.json({ moved: true, columnSourceId: body.columnSourceId, position });
}
