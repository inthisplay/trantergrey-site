import { apiData, apiError, page, requireApiScope } from '../../../_lib/internal-api';
import type { AdminEnvironment } from '../../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment };
type Card = { id: string; sourceId: string; title: string; client: string; columnSourceId: string; archived: number; dueOn: string | null; updatedAt: string | null };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const access = await requireApiScope(request, env, 'cards:read'); if (access instanceof Response) return access;
  try {
    const { limit, cursor, query } = page(request); const url = new URL(request.url);
    const client = url.searchParams.get('client')?.trim().toLocaleLowerCase() || '';
    const columnId = url.searchParams.get('columnId') || '';
    const updatedAfter = url.searchParams.get('updatedAfter') || '';
    const rows = await env.TG_DATA.prepare(`SELECT p.id, p.source_id AS sourceId, COALESCE(o.title, p.title) AS title, COALESCE(o.client, '') AS client,
      COALESCE(o.column_source_id, p.column_source_id) AS columnSourceId, COALESCE(o.archived, p.archived) AS archived,
      COALESCE(o.due_on, p.due_on) AS dueOn, COALESCE(o.edited_at, p.updated_at, p.created_at) AS updatedAt
      FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id = p.source_id`).all<Card>();
    const cards = rows.results.filter((card) => {
      const matches = `${card.title} ${card.client}`.toLocaleLowerCase().includes(query);
      return matches && (!client || card.client.toLocaleLowerCase().includes(client)) && (!columnId || card.columnSourceId === columnId)
        && (!updatedAfter || Boolean(card.updatedAt && card.updatedAt > updatedAfter));
    }).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    const start = cursor ? Math.max(0, cards.findIndex((card) => card.id === cursor) + 1) : 0;
    const items = cards.slice(start, start + limit);
    return apiData(items, { nextCursor: items.length === limit ? items.at(-1)?.id || null : null });
  } catch (error) { return apiError('card_list_failed', error instanceof Error ? error.message : 'Unable to load cards.', 502); }
}
