import { adminSession, sameValue, type AdminEnvironment } from './admin';

export type ApiActor = { type: 'user' | 'integration'; id: string; name: string; email: string | null; scopes: Set<string> };
type Credential = { id: string; name: string; scopes_json: string };

const allScopes = new Set(['videos:read', 'cards:read', 'cards:write', 'associations:write']);

function bearer(request: Request) {
  return request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}

async function hash(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function scopes(value: string) {
  try { return new Set((JSON.parse(value) as unknown[]).filter((item): item is string => typeof item === 'string')); }
  catch { return new Set<string>(); }
}

export async function apiActor(request: Request, env: AdminEnvironment): Promise<ApiActor | null> {
  const session = await adminSession(request, env);
  if (session) return { type: 'user', id: session.email || session.name, name: session.name, email: session.email, scopes: allScopes };

  const value = bearer(request);
  if (!value) return null;
  if (env.PRODUCTION_API_TOKEN && sameValue(value, env.PRODUCTION_API_TOKEN)) {
    return { type: 'integration', id: 'legacy-production-token', name: 'Legacy production integration', email: null, scopes: allScopes };
  }
  const match = value.match(/^tg_([A-Za-z0-9-]{20,})_([A-Za-z0-9_-]{24,})$/);
  if (!match) return null;
  const credential = await env.TG_DATA.prepare('SELECT id, name, scopes_json FROM api_integration_credentials WHERE id = ? AND secret_hash = ? AND revoked_at IS NULL')
    .bind(match[1], await hash(value)).first<Credential>();
  if (!credential) return null;
  void env.TG_DATA.prepare('UPDATE api_integration_credentials SET last_used_at = ? WHERE id = ?').bind(new Date().toISOString(), credential.id).run();
  return { type: 'integration', id: credential.id, name: credential.name, email: null, scopes: scopes(credential.scopes_json) };
}

export async function requireApiScope(request: Request, env: AdminEnvironment, scope: string): Promise<ApiActor | Response> {
  const actor = await apiActor(request, env);
  if (!actor) return apiError('unauthorized', 'Authenticate to use the internal API.', 401);
  if (!actor.scopes.has(scope)) return apiError('forbidden', 'This credential does not have the required scope.', 403);
  if (actor.type === 'user') {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return apiError('invalid_origin', 'This request must come from the same site.', 403);
  }
  return actor;
}

export function apiError(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export function apiData(data: unknown, meta?: Record<string, unknown>, status = 200) {
  return Response.json({ data, ...(meta ? { meta } : {}) }, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export function page(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 30));
  const cursor = url.searchParams.get('cursor') || '';
  return { limit, cursor, query: url.searchParams.get('query')?.trim().toLocaleLowerCase() || '' };
}
