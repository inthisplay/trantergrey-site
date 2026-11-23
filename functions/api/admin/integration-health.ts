import type { AdminEnvironment } from '../../_lib/admin';
import { requireAccessOwner } from '../../_lib/access-owner';
export async function onRequest({ request, env }: { request: Request; env: AdminEnvironment }) {
  const denied = await requireAccessOwner(request, env); if (denied) return denied;
  const headers = { 'Cache-Control': 'private, no-store' };
  if (request.method !== 'GET') return Response.json({ error: 'Use GET.' }, { status: 405, headers });
  const since = new Date(Date.now() - 86400000).toISOString();
  const [counts, events] = await Promise.all([
    env.TG_DATA.prepare('SELECT category,COUNT(*) AS count FROM integration_events WHERE occurred_at>=? GROUP BY category').bind(since).all(),
    env.TG_DATA.prepare('SELECT id,occurred_at,surface,operation,category,status FROM integration_events ORDER BY occurred_at DESC LIMIT 50').all(),
  ]);
  return Response.json({ since, counts: counts.results, events: events.results }, { headers });
}
