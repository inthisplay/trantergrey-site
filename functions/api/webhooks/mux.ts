import { enqueueMuxReady, deliverEvents } from '../../_lib/mcp-events';
import { recordIntegrationEvent } from '../../_lib/integration-health';
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
  // Bound unauthenticated input before buffering for signature verification.
  const reader=request.body?.getReader(); const chunks:Uint8Array[]=[]; let size=0;
  if(reader) while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;
    if(size>1048576){await reader.cancel();return Response.json({error:'Webhook body too large.'},{status:413});}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const rawBody = new TextDecoder().decode(bytes);
  if (!(await validMuxSignature(rawBody, request.headers.get('mux-signature'), secret))) return Response.json({ error: 'Invalid Mux webhook signature.' }, { status: 401 });
  let event: { type?: string; id?: string; created_at?: string; data?: { id?: string } };
  try {event=JSON.parse(rawBody);if(!event || typeof event.type!=='string')throw new Error();}
  catch {return Response.json({error:'Invalid webhook body.'},{status:400});}
  if(event.type==='video.asset.ready' && (typeof event.id!=='string' || typeof event.data?.id!=='string' || !/^[A-Za-z0-9_-]{1,255}$/.test(event.data.id) || typeof event.created_at!=='string' || !Number.isFinite(Date.parse(event.created_at)))) {
    return Response.json({error:'Invalid asset-ready event.'},{status:400});
  }
  try {
    if(event.type==='video.asset.ready') {
      if(!env.MCP_AUTH)throw new Error();
      const eventEnv={...env,MCP_AUTH:env.MCP_AUTH};
      await enqueueMuxReady(eventEnv,event as {id:string;created_at:string;data:{id:string}});
      waitUntil(deliverEvents(eventEnv).catch(()=>recordIntegrationEvent(env,'mcp','event_delivery_worker','server_error',503)));
    }
    if (event.type?.startsWith('video.asset.') || event.type?.startsWith('video.upload.')) {
      await Promise.all([invalidateMuxLibraryCache(env), invalidateMuxBrowseIndex(env)]);
      waitUntil(refreshMuxLibraryCatalog(env).catch(()=>recordIntegrationEvent(env,'api','mux_catalog_refresh','server_error',503)));
    }
    return Response.json({ ok: true });
  } catch {
    await recordIntegrationEvent(env,'api','mux_webhook','server_error',503);
    // Mux must retry storage failures; never acknowledge a lost event.
    return Response.json({ error: 'Webhook processing unavailable. Retry later.' }, { status: 503 });
  }
}
