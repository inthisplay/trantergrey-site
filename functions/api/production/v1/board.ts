import { sameValue, type AdminEnvironment } from '../../../_lib/admin';
type Context = { request: Request; env: AdminEnvironment };
function allowed(request: Request, env: AdminEnvironment) { const value = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''; return Boolean(env.PRODUCTION_API_TOKEN && sameValue(value, env.PRODUCTION_API_TOKEN)); }
export async function onRequestGet({ request, env }: Context): Promise<Response> {
  if (!allowed(request, env)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const [columns, cards] = await Promise.all([env.TG_DATA.prepare('SELECT source_id AS sourceId, name, position FROM production_columns ORDER BY position, source_id').all(), env.TG_DATA.prepare('SELECT id, source_id AS sourceId, column_source_id AS columnSourceId, position, title, archived, due_on AS dueOn, completed_at AS completedAt, created_at AS createdAt, updated_at AS updatedAt FROM production_cards ORDER BY position, created_at').all()]);
  return Response.json({ version: 'v1', columns: columns.results, cards: cards.results }, { headers: { 'Cache-Control': 'private, no-store' } });
}
