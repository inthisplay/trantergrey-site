import { adminResponse, type AdminEnvironment } from '../../_lib/admin';
import { clientActivity } from '../../_lib/client-activity';

const limit = 5 * 1024 * 1024;
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const fail = (error: string, status = 400) => Response.json({ error }, { status, headers });

export async function onRequest({ request, env }: { request: Request; env: AdminEnvironment }): Promise<Response> {
  const denied = await adminResponse(request, env); if (denied) return denied;
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) return fail('Method not allowed.', 405);
  if (request.method !== 'GET' && request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return fail('Invalid request origin.', 403);
  const id = new URL(request.url).searchParams.get('client');
  const client = await env.TG_DATA.prepare('SELECT id,logo_key FROM client_directory WHERE id=?').bind(id).first<{ id: string; logo_key: string | null }>();
  if (!client) return fail('Client not found.', 404);
  const bucket = env.PRODUCTION_ARCHIVE;
  if (!bucket) return fail('Logo storage is unavailable. Please try again later.', 503);
  if (request.method === 'GET') {
    const object = client.logo_key ? await bucket.get(client.logo_key) : null;
    if (!object) return fail('Logo not found.', 404);
    return new Response(object.body, { headers: { ...headers, 'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream' } });
  }
  let key: string | null = null;
  if (request.method === 'POST') {
    const type = request.headers.get('content-type') || '';
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) return fail('Choose a PNG, JPG, or WebP image.');
    if (Number(request.headers.get('content-length')) > limit) return fail('Choose an image smaller than 5 MB.', 413);
    if (!request.body) return fail('Choose an image.');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); return fail('Choose an image smaller than 5 MB.', 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const matches = type === 'image/png' ? [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)
      : type === 'image/jpeg' ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255
      : new TextDecoder().decode(bytes.slice(0,4))==='RIFF' && new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
    if (!matches) return fail('This file is not a supported image. Choose a PNG, JPG, or WebP image.');
    key = `client-logos/${client.id}/${crypto.randomUUID()}`;
    await bucket.put(key, bytes, { httpMetadata: { contentType: type } });
  }
  await env.TG_DATA.batch([
    env.TG_DATA.prepare('UPDATE client_directory SET logo_key=? WHERE id=?').bind(key, client.id),
    await clientActivity(request, env, client.id, key ? 'client_logo_updated' : 'client_logo_removed', key ? 'Updated the client logo.' : 'Removed the client logo.', 'management'),
  ]);
  return Response.json({ logo_key: key }, { headers });
}
