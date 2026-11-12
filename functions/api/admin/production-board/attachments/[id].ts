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
  // Fetch the archive object directly first. Some historic uploads are
  // available through Pages' R2 binding but reject an initial 1-byte range
  // probe, even though the full object is present.
  const fullFile = await env.PRODUCTION_ARCHIVE.get(attachment.r2Key);
  if (!fullFile) {
    console.error('Deck attachment missing from bound archive', {
      attachmentId: params.id,
      r2Key: attachment.r2Key,
      status: attachment.status,
    });
    return Response.json({ error: 'The archived file could not be found.' }, { status: 404 });
  }
  const requestedRange = byteRange(request.headers.get('range'), fullFile.size);
  if (requestedRange === 'invalid') return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${fullFile.size}` } });
  const rangedFile = requestedRange ? await env.PRODUCTION_ARCHIVE.get(attachment.r2Key, { range: requestedRange }) : null;
  // Falling back to a standard full response keeps the archive playable in
  // browsers when R2 declines an otherwise valid range read.
  const file = rangedFile || fullFile;
  const servesRange = Boolean(rangedFile && requestedRange);
  const offset = file.range?.offset ?? 0;
  const length = file.range?.length ?? file.size;
  return new Response(file.body, {
    status: servesRange ? 206 : 200,
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Length': String(length),
      ...(servesRange ? { 'Content-Range': `bytes ${offset}-${offset + length - 1}/${fullFile.size}` } : {}),
      // The database value tracks the archive's canonical media type. Prefer it
      // over historic source metadata so Safari receives video/mp4 after a repair.
      'Content-Type': attachment.contentType || file.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
