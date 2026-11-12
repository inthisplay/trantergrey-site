import { adminResponse, type AdminEnvironment } from '../../../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment; params: { id: string } };

const byteRange = (value: string | null, size: number) => {
  if (!value?.startsWith('bytes=')) return null;
  const [startValue, endValue] = value.slice(6).split('-', 2);
  const start = Number.parseInt(startValue, 10);
  const end = endValue ? Number.parseInt(endValue, 10) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) return 'invalid';
  return { offset: start, length: Math.min(end, size - 1) - start + 1 };
};

export async function onRequestGet({ request, env, params }: Context): Promise<Response> {
  const denied = await adminResponse(request, env); if (denied) return denied;
  if (!env.PRODUCTION_ARCHIVE) return Response.json({ error: 'Private production storage is not configured.' }, { status: 503 });
  const attachment = await env.TG_DATA.prepare('SELECT filename, content_type AS contentType, r2_key AS r2Key, status FROM production_attachments WHERE source_id = ?').bind(params.id).first<{ filename: string; contentType: string | null; r2Key: string | null; status: string }>();
  if (!attachment || attachment.status !== 'stored' || !attachment.r2Key) return Response.json({ error: 'This source file is unavailable.' }, { status: 404 });
  const initial = await env.PRODUCTION_ARCHIVE.get(attachment.r2Key, { range: { offset: 0, length: 1 } });
  if (!initial) return Response.json({ error: 'The archived file could not be found.' }, { status: 404 });
  const requestedRange = byteRange(request.headers.get('range'), initial.size);
  if (requestedRange === 'invalid') return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${initial.size}` } });
  const file = requestedRange ? await env.PRODUCTION_ARCHIVE.get(attachment.r2Key, { range: requestedRange }) : await env.PRODUCTION_ARCHIVE.get(attachment.r2Key);
  if (!file) return Response.json({ error: 'The archived file could not be found.' }, { status: 404 });
  const offset = file.range?.offset ?? 0;
  const length = file.range?.length ?? file.size;
  return new Response(file.body, {
    status: requestedRange ? 206 : 200,
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Length': String(length),
      ...(requestedRange ? { 'Content-Range': `bytes ${offset}-${offset + length - 1}/${initial.size}` } : {}),
      'Content-Type': file.httpMetadata?.contentType || attachment.contentType || 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
