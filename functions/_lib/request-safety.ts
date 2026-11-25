import type { AdminEnvironment } from './admin';
import { enforceRateLimit, peer } from './integration-health';

// Binary upload handlers and signed webhooks enforce their own streaming limits.
const binary = /^\/api\/admin\/(?:client-logo|rolodex\/upload|client-hq-drive|production-board\/[^/]+\/(?:gallery|attachments))$/;
export async function requestSafety(request: Request, env: AdminEnvironment): Promise<Response | null> {
  const url = new URL(request.url), path = url.pathname;
  if (!path.startsWith('/api/')) return null;
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  const error = (message: string, status: number) => Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  if (unsafe && request.headers.get('cookie')?.includes('tg_admin=')) {
    const origin = request.headers.get('origin');
    if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') return error('This request must come from the same site.', 403);
  }
  if (unsafe && request.body && !binary.test(path) && !path.startsWith('/api/webhooks/') && !path.startsWith('/api/auth/')) {
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return error('Send JSON.', 415);
    const limit = path === '/api/admin/production-board/import' ? 32 * 1024 * 1024 : 1024 * 1024;
    if (Number(request.headers.get('content-length')) > limit) return error('This request is too large.', 413);
    const reader = request.clone().body!.getReader();
    let bytes = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > limit) { void reader.cancel().catch(() => {}); return error('This request is too large.', 413); }
      }
    } finally { reader.releaseLock(); }
  }
  const bucket = path === '/api/contact' ? ['public_contact', 6] as const
    : path === '/api/meet/join' ? ['public_meeting', 60] as const
    : path === '/api/watch/download' ? ['public_download', unsafe ? 180 : 600] as const
    : path.startsWith('/api/watch/') || path === '/api/showcase' ? ['public_watch', 600] as const : null;
  if (bucket) {
    const denied = await enforceRateLimit(env, 'api', bucket[0], peer(request), bucket[1]);
    if (denied) return Response.json({ error: 'Too many requests. Please wait a minute and try again.' }, { status: 429, headers: denied.headers });
  }
  return null;
}
