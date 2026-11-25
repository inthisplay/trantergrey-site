import type { AdminEnvironment } from './admin';
export type Surface = 'api' | 'mcp';
export type Category = 'server_error' | 'rate_limited' | 'auth_rejected';
// Only call with application-owned operation labels. Never pass exception text,
// request bodies, URLs, headers, IPs, or user-supplied names into monitoring.
export async function recordIntegrationEvent(env: AdminEnvironment, surface: Surface, operation: string, category: Category, status: number, reference = crypto.randomUUID()) {
  const event = { reference, surface, operation, category, status };
  if (category === 'server_error') console.error(JSON.stringify(event));
  else console.warn(JSON.stringify(event));
  try {
    await env.TG_DATA.prepare('INSERT INTO integration_events(id,occurred_at,surface,operation,category,status) VALUES(?,?,?,?,?,?)')
      .bind(reference, new Date().toISOString(), surface, operation, category, status).run();
  } catch { console.error(JSON.stringify({ reference, surface, operation: 'monitoring_storage', category: 'server_error', status: 503 })); }
  return reference;
}
export function operationLabel(path: string) {
  if (/^\/api\/internal\/v1\/clients\/[^/]+\/deletion$/.test(path)) return 'clients/deletion';
  if (/^\/api\/internal\/v1\/cards\/[^/]+\/comments$/.test(path)) return 'cards/comments';
  if (/^\/api\/internal\/v1\/cards\/[^/]+\/move$/.test(path)) return 'cards/move';
  if (/^\/api\/internal\/v1\/cards\/[^/]+\/videos$/.test(path)) return 'cards/videos';
  if (/^\/api\/internal\/v1\/cards\/[^/]+\/activity$/.test(path)) return 'cards/activity';
  if (/^\/api\/internal\/v1\/cards\/[^/]+$/.test(path)) return 'cards/detail';
  if (/^\/api\/internal\/v1\/videos\/[^/]+\/cards$/.test(path)) return 'videos/cards';
  if (path === '/api/internal/v1/videos/workspace') return 'videos/workspace';
  if (/^\/api\/internal\/v1\/videos\/[^/]+$/.test(path)) return 'videos/detail';
  for (const name of ['notifications','cards','videos','boards/production','client-hq']) if (path === '/api/internal/v1/' + name) return name;
  for (const name of ['inbox','client-hq','client-hq-files','mcp-connections','integration-health']) if (path === '/api/admin/' + name) return name;
  for (const name of ['register','authorize','token','revoke','mcp']) if (path === '/' + name) return name;
  return 'other';
}
async function digest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
export function peer(request: Request) { return request.headers.get('CF-Connecting-IP') || 'unknown-peer'; }
// Atomic global fixed windows in D1: no per-instance memory counter. A single
// row per subject/bucket rolls forward each minute. Cloudflare supplies the IP.
export async function enforceRateLimit(env: AdminEnvironment, surface: Surface, bucket: string, subject: string, limit: number) {
  const now = Math.floor(Date.now() / 1000), window = Math.floor(now / 60) * 60;
  const key = await digest(`${surface}:${bucket}:${subject}`);
  const row = await env.TG_DATA.prepare(`INSERT INTO integration_rate_limits(bucket_key,window_start,hits,expires_at) VALUES(?,?,1,?)
    ON CONFLICT(bucket_key) DO UPDATE SET hits=CASE WHEN window_start=excluded.window_start THEN hits+1 ELSE 1 END,
    window_start=excluded.window_start,expires_at=excluded.expires_at RETURNING hits`).bind(key, window, window + 120).first<{ hits: number }>();
  if (!row) throw new Error('Rate limit unavailable');
  if (row.hits <= limit) return null;
  if (row.hits === limit + 1) await recordIntegrationEvent(env, surface, bucket, 'rate_limited', 429);
  return Response.json({ error: { code: 'rate_limited', message: 'Too many requests. Wait before trying again.' } }, {
    status: 429, headers: { 'Retry-After': String(window + 60 - now), 'Cache-Control': 'no-store' },
  });
}
export async function cleanupIntegrationHealth(env: AdminEnvironment) {
  await env.TG_DATA.batch([
    env.TG_DATA.prepare('DELETE FROM integration_rate_limits WHERE expires_at<?').bind(Math.floor(Date.now()/1000)),
    env.TG_DATA.prepare('DELETE FROM integration_events WHERE occurred_at<?').bind(new Date(Date.now() - 30*86400000).toISOString()),
    env.TG_DATA.prepare('DELETE FROM integration_events WHERE id IN (SELECT id FROM integration_events ORDER BY occurred_at DESC LIMIT -1 OFFSET 5000)'),
  ]);
}
