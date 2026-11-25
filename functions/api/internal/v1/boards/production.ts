import { apiData, requireApiScope } from '../../../../_lib/internal-api';
import type { AdminEnvironment } from '../../../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const access = await requireApiScope(request, env, 'cards:read'); if (access instanceof Response) return access;
  const columns = await env.TG_DATA.prepare(`SELECT c.source_id AS id, COALESCE(o.name, c.name) AS name, o.color, c.position,
    COUNT(p.id) AS cardCount FROM production_columns c LEFT JOIN production_column_overrides o ON o.column_source_id = c.source_id
    LEFT JOIN production_cards p ON COALESCE((SELECT po.column_source_id FROM production_card_overrides po WHERE po.card_source_id = p.source_id), p.column_source_id) = c.source_id AND NOT EXISTS (SELECT 1 FROM production_card_overrides deleted WHERE deleted.card_source_id=p.source_id AND deleted.deleted_at IS NOT NULL)
    WHERE COALESCE(o.archived, 0) = 0 GROUP BY c.source_id ORDER BY c.position, c.source_id`).all();
  return apiData({ id: 'production', name: 'The Deck', columns: columns.results });
}
