import { sameValue, type AdminEnvironment } from '../../../_lib/admin';
type Context = { request: Request; env: AdminEnvironment };
function allowed(request: Request, env: AdminEnvironment) { const value = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''; return Boolean(env.PRODUCTION_API_TOKEN && sameValue(value, env.PRODUCTION_API_TOKEN)); }
export async function onRequestGet({ request, env }: Context): Promise<Response> {
  if (!allowed(request, env)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const [columns, cards] = await Promise.all([env.TG_DATA.prepare('SELECT c.source_id AS sourceId, COALESCE(o.name,c.name) AS name, c.position FROM production_columns c LEFT JOIN production_column_overrides o ON o.column_source_id=c.source_id WHERE COALESCE(o.archived,0)=0 ORDER BY c.position,c.source_id').all(), env.TG_DATA.prepare(`SELECT p.id,p.source_id AS sourceId,COALESCE(o.column_source_id,p.column_source_id) AS columnSourceId,COALESCE(o.position,p.position) AS position,COALESCE(o.title,p.title) AS title,COALESCE(o.archived,p.archived) AS archived,COALESCE(o.due_on,p.due_on) AS dueOn,p.completed_at AS completedAt,p.created_at AS createdAt,COALESCE(o.edited_at,p.updated_at,p.created_at) AS updatedAt FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id=p.source_id WHERE o.deleted_at IS NULL ORDER BY COALESCE(o.position,p.position),p.created_at`).all()]);
  return Response.json({ version: 'v1', columns: columns.results, cards: cards.results }, { headers: { 'Cache-Control': 'private, no-store' } });
}
