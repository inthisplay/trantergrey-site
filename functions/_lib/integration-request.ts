import type { AdminEnvironment } from './admin';
import { apiActor, withApiActor } from './internal-api';
import { enforceRateLimit, operationLabel, peer, recordIntegrationEvent } from './integration-health';
type Context = { request: Request; env: AdminEnvironment; next: () => Promise<Response> };
export async function integrationRequest({ request, env, next }: Context) {
  const operation = operationLabel(new URL(request.url).pathname);
  try {
    const edgeLimit = await enforceRateLimit(env, 'api', 'ingress', peer(request), 1200);
    if (edgeLimit) return edgeLimit;
    const actor = await apiActor(request, env);
    const limit = await enforceRateLimit(env, 'api', actor ? 'authenticated' : 'anonymous', actor ? `${actor.type}:${actor.id}` : peer(request), actor ? 300 : 60);
    if (limit) return limit;
    const response = actor ? await withApiActor(request, actor, next) : await next();
    if (response.status < 500) return response;
    const reference = await recordIntegrationEvent(env, 'api', operation, 'server_error', response.status);
    const headers = new Headers(response.headers); headers.set('X-Request-Id', reference);
    headers.set('Content-Type', 'application/json'); headers.set('Cache-Control', 'no-store');
    return Response.json({ error: { code: 'service_unavailable', message: 'Service temporarily unavailable. Check current state before retrying a write.', reference } }, { status: response.status, headers });
  } catch {
    const reference = await recordIntegrationEvent(env, 'api', operation, 'server_error', 503);
    return Response.json({ error: { code: 'service_unavailable', message: 'Service temporarily unavailable.', reference } }, { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Request-Id': reference } });
  }
}
