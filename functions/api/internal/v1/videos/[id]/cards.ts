import { apiData, apiError, requireApiScope } from '../../../../../_lib/internal-api';
import type { AdminEnvironment } from '../../../../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment; params: { id: string } };

export async function onRequestGet({ request, env, params }: Context): Promise<Response> {
  const access = await requireApiScope(request, env, 'videos:read'); if (access instanceof Response) return access;
  if (!/^[A-Za-z0-9]+$/.test(params.id)) return apiError('invalid_video_id', 'Choose a valid Mux asset ID.', 400);
  const links = await env.TG_DATA.prepare(`SELECT l.card_id AS cardId, l.linked_at AS linkedAt, p.source_id AS sourceId,
    COALESCE(o.title, p.title) AS title, COALESCE(o.client, '') AS client, COALESCE(o.column_source_id, p.column_source_id) AS columnSourceId
    FROM production_card_video_links l JOIN production_cards p ON p.id = l.card_id
    LEFT JOIN production_card_overrides o ON o.card_source_id = p.source_id WHERE l.asset_id = ? ORDER BY l.linked_at DESC`).bind(params.id).all();
  return apiData(links.results);
}
