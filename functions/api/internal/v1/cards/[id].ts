import { apiData, apiError, requireApiScope } from '../../../../_lib/internal-api';
import type { AdminEnvironment } from '../../../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment; params: { id: string } };

export async function onRequestGet({ request, env, params }: Context): Promise<Response> {
  const access = await requireApiScope(request, env, 'cards:read'); if (access instanceof Response) return access;
  const card = await env.TG_DATA.prepare(`SELECT p.id, p.source_id AS sourceId, COALESCE(o.title, p.title) AS title,
    COALESCE(o.notes_html, o.description_html, p.description_html) AS notesHtml, COALESCE(o.client, '') AS client,
    COALESCE(o.assignees_json, p.assignees_json, '[]') AS assigneesJson, COALESCE(o.due_on, p.due_on) AS dueOn,
    COALESCE(o.column_source_id, p.column_source_id) AS columnSourceId, COALESCE(o.archived, p.archived) AS archived,
    COALESCE(o.edited_at, p.updated_at, p.created_at) AS updatedAt, p.created_at AS createdAt
    FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id = p.source_id WHERE p.id = ?`).bind(params.id).first();
  if (!card) return apiError('card_not_found', 'Card not found.', 404);
  const [links, column] = await Promise.all([
    env.TG_DATA.prepare('SELECT asset_id AS assetId, linked_at AS linkedAt, source_uploaded_at AS sourceUploadedAt, uploader_name AS uploaderName, uploader_email AS uploaderEmail FROM production_card_video_links WHERE card_id = ? ORDER BY linked_at DESC').bind(params.id).all(),
    env.TG_DATA.prepare('SELECT COALESCE(co.name, c.name) AS name FROM production_cards p LEFT JOIN production_card_overrides po ON po.card_source_id = p.source_id JOIN production_columns c ON c.source_id = COALESCE(po.column_source_id, p.column_source_id) LEFT JOIN production_column_overrides co ON co.column_source_id = c.source_id WHERE p.id = ?').bind(params.id).first(),
  ]);
  return apiData({ ...card, column, videoLinks: links.results });
}
