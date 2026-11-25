import { apiData, apiError, page, requireApiScope } from '../../../_lib/internal-api';
import type { AdminEnvironment } from '../../../_lib/admin';
import { CardInputError, createProductionCard } from '../../../_lib/create-production-card';

type Context = { request: Request; env: AdminEnvironment };
type Card = { id: string; sourceId: string; title: string; client: string; columnSourceId: string; archived: number; dueOn: string | null; updatedAt: string | null };

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  const access = await requireApiScope(request, env, 'cards:create'); if (access instanceof Response) return access;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return apiError('invalid_card', 'Provide card details as a JSON object.', 400);
  try {
    const card = await createProductionCard(env, body, access);
    return apiData({ ...card, url: `${new URL(request.url).origin}/app/deck?card=${encodeURIComponent(card.id)}` }, undefined, card.created ? 201 : 200);
  } catch (error) {
    if (error instanceof CardInputError) return apiError('invalid_card', error.message, error.status);
    return apiError('card_create_failed', 'Unable to create the card. Retry with the same request ID.', 503);
  }
}

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const access = await requireApiScope(request, env, 'cards:read'); if (access instanceof Response) return access;
  try {
    const { limit, cursor, query } = page(request); const url = new URL(request.url); const client = url.searchParams.get('client')?.trim().toLocaleLowerCase() || ''; const columnId = url.searchParams.get('columnId') || ''; const updatedAfter = url.searchParams.get('updatedAfter') || '';
    const clauses: string[] = ['o.deleted_at IS NULL']; const values: unknown[] = [];
    if (query) { clauses.push("LOWER(COALESCE(o.title, p.title) || ' ' || COALESCE(o.client, '')) LIKE ?"); values.push(`%${query}%`); }
    if (client) { clauses.push("LOWER(COALESCE(o.client, '')) LIKE ?"); values.push(`%${client}%`); }
    if (columnId) { clauses.push('COALESCE(o.column_source_id, p.column_source_id) = ?'); values.push(columnId); }
    if (updatedAfter) { clauses.push('COALESCE(o.edited_at, p.updated_at, p.created_at) > ?'); values.push(updatedAfter); }
    const offset = Math.max(0, Number.parseInt(cursor, 10) || 0);
    const order = columnId ? 'CASE WHEN COALESCE(o.position, p.position) IS NULL THEN 1 ELSE 0 END, COALESCE(o.position, p.position), p.created_at, p.id' : 'COALESCE(o.edited_at, p.updated_at, p.created_at) DESC, p.id';
    const sql = `SELECT p.id, p.source_id AS sourceId, COALESCE(o.title, p.title) AS title, COALESCE(o.client, '') AS client, COALESCE(o.column_source_id, p.column_source_id) AS columnSourceId, COALESCE(o.archived, p.archived) AS archived, COALESCE(o.due_on, p.due_on) AS dueOn, COALESCE(o.edited_at, p.updated_at, p.created_at) AS updatedAt,
      p.completed_at AS completedAt, s.attention, s.filming_on AS filmingOn, s.dismissed_at AS dismissedAt,
      (SELECT MAX(c.created_at) FROM production_local_comments c WHERE c.card_source_id=p.source_id AND c.deleted_at IS NULL AND c.body_html LIKE '%class="production-comment-mux-asset"%') AS muxAddedAt,
      (SELECT json_object('id',q.id,'author',q.author_name) FROM production_local_comments q WHERE q.card_source_id=p.source_id AND q.is_question=1 AND q.question_resolved_at IS NULL AND q.deleted_at IS NULL ORDER BY q.created_at DESC,q.id DESC LIMIT 1) AS openQuestion,
      (SELECT MAX(g.created_at) FROM production_gallery g WHERE g.card_source_id=p.source_id AND g.deleted_at IS NULL) AS galleryAddedAt
      FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id = p.source_id LEFT JOIN production_card_signals s ON s.card_source_id=p.source_id${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY ${order} LIMIT ? OFFSET ?`;
    const rows = await env.TG_DATA.prepare(sql).bind(...values, limit + 1, offset).all<Card>();
    const items = rows.results.slice(0, limit); return apiData(items, { nextCursor: rows.results.length > limit ? String(offset + items.length) : null });
  } catch (error) { return apiError('card_list_failed', error instanceof Error ? error.message : 'Unable to load cards.', 502); }
}
