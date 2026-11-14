import { invalidateMuxBrowseIndex, refreshMuxLibraryCatalog } from '../../_lib/mux-library';
import { invalidateMuxLibraryCache } from '../../_lib/mux';
import type { AdminEnvironment } from '../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment; waitUntil(promise: Promise<unknown>): void };
const maxWebhookAgeSeconds = 5 * 60;

function constantTimeEqual(first: string, second: string) {
  const a = new TextEncoder().encode(first); const b = new TextEncoder().encode(second);
  let different = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) different |= (a[index] || 0) ^ (b[index] || 0);
  return different === 0;
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function validMuxSignature(rawBody: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = new Map<string, string>();
  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator > 0) parts.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  const timestamp = parts.get('t'); const signature = parts.get('v1');
  const issuedAt = Number(timestamp);
  if (!timestamp || !signature || !Number.isFinite(issuedAt) || Math.abs(Date.now() / 1000 - issuedAt) > maxWebhookAgeSeconds) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`)));
  return constantTimeEqual(expected, signature);
}

export async function onRequestPost({ request, env, waitUntil }: Context) {
  const secret = env.MUX_WEBHOOK_SIGNING_SECRET;
  if (!secret) return Response.json({ error: 'Mux webhooks are not configured.' }, { status: 503 });
  const rawBody = await request.text();
  if (!(await validMuxSignature(rawBody, request.headers.get('mux-signature'), secret))) return Response.json({ error: 'Invalid Mux webhook signature.' }, { status: 401 });
  try {
    const event = JSON.parse(rawBody) as { type?: string };
    // Mux may retry deliveries; rebuilding is intentionally idempotent. Do it
    // after responding so Mux gets a prompt acknowledgement (and will retry
    // only real delivery failures), while the next admin visit finds it warm.
    if (event.type?.startsWith('video.asset.') || event.type?.startsWith('video.upload.')) {
      await Promise.all([invalidateMuxLibraryCache(env), invalidateMuxBrowseIndex(env)]);
      waitUntil(refreshMuxLibraryCatalog(env).catch((error) => {
        console.error('Mux webhook catalog refresh failed', error instanceof Error ? error.message : 'Unknown error');
      }));
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Invalid webhook body.' }, { status: 400 });
  }
}
