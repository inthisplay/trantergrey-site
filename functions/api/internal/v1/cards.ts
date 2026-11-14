import { apiData, apiError, page, requireApiScope } from '../../../_lib/internal-api';
import type { AdminEnvironment } from '../../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment };
type Card = { id: string; sourceId: string; title: string; client: string; columnSourceId: string; archived: number; dueOn: string | null; updatedAt: string | null };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const access = await requireApiScope(request, env, 'cards:read'); if (access instanceof Response) return access;
  try {
    const { limit, cursor, query } = page(request); const url = new URL(request.url); const client = url.searchParams.get('client')?.trim().toLocaleLowerCase() || ''; const columnId = url.searchParams.get('columnId') || ''; const updatedAfter = url.searchParams.get('updatedAfter') || '';
    const clauses: string[] = []; const values: unknown[] = [];
    if (query) { clauses.push("LOWER(COALESCE(o.title, p.title) || ' ' || COALESCE(o.client, '')) LIKE ?"); values.push(`%${query}%`); }
    if (client) { clauses.push("LOWER(COALESCE(o.client, '')) LIKE ?"); values.push(`%${client}%`); }
    if (columnId) { clauses.push('COALESCE(o.column_source_id, p.column_source_id) = ?'); values.push(columnId); }
    if (updatedAfter) { clauses.push('COALESCE(o.edited_at, p.updated_at, p.created_at) > ?'); values.push(updatedAfter); }
    const offset = Math.max(0, Number.parseInt(cursor, 10) || 0);
    const order = columnId ? 'CASE WHEN COALESCE(o.position, p.position) IS NULL THEN 1 ELSE 0 END, COALESCE(o.position, p.position), p.created_at, p.id' : 'COALESCE(o.edited_at, p.updated_at, p.created_at) DESC, p.id';
    const sql = `SELECT p.id, p.source_id AS sourceId, COALESCE(o.title, p.title) AS title, COALESCE(o.client, '') AS client, COALESCE(o.column_source_id, p.column_source_id) AS columnSourceId, COALESCE(o.archived, p.archived) AS archived, COALESCE(o.due_on, p.due_on) AS dueOn, COALESCE(o.edited_at, p.updated_at, p.created_at) AS updatedAt FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id = p.source_id${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY ${order} LIMIT ? OFFSET ?`;
    const rows = await env.TG_DATA.prepare(sql).bind(...values, limit + 1, offset).all<Card>();
    const items = rows.results.slice(0, limit); return apiData(items, { nextCursor: rows.results.length > limit ? String(offset + items.length) : null });
  } catch (error) { return apiError('card_list_failed', error instanceof Error ? error.message : 'Unable to load cards.', 502); }
}
