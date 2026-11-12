import { adminResponse, adminSession, type AdminEnvironment } from '../../../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment; params: { id: string } };
const maxUploadBytes = 90 * 1024 * 1024;
const supportedType = (value: string) => value.startsWith('image/') || value.startsWith('video/') || value.startsWith('audio/') || [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
].includes(value);
const safeFilename = (value: string) => value.replace(/[\\/\0]/g, '-').replace(/[^\w.()\- ]+/g, '-').trim().slice(0, 180) || 'attachment';

export async function onRequestPost({ request, env, params }: Context): Promise<Response> {
  const denied = await adminResponse(request, env); if (denied) return denied;
  const session = await adminSession(request, env);
  if (!session) return Response.json({ error: 'Sign in to upload an attachment.' }, { status: 401 });
  if (!env.PRODUCTION_ARCHIVE) return Response.json({ error: 'Private production storage is not configured.' }, { status: 503 });
  const card = await env.TG_DATA.prepare('SELECT source_id FROM production_cards WHERE id = ?').bind(params.id).first<{ source_id: string }>();
  if (!card) return Response.json({ error: 'Production card not found.' }, { status: 404 });
  const filename = safeFilename(request.headers.get('x-file-name') || 'attachment');
  const contentType = (request.headers.get('content-type') || 'application/octet-stream').split(';', 1)[0].trim().toLowerCase();
  const size = Number(request.headers.get('x-file-size') || request.headers.get('content-length') || 0);
  if (!supportedType(contentType)) return Response.json({ error: 'Upload an image, video, audio, PDF, or office document.' }, { status: 415 });
  if (!Number.isFinite(size) || size < 1 || size > maxUploadBytes) return Response.json({ error: 'Files must be between 1 byte and 90 MB.' }, { status: 413 });
  if (!request.body) return Response.json({ error: 'Choose a file to upload.' }, { status: 400 });
  const sourceId = `local-attachment-${crypto.randomUUID()}`;
  const r2Key = `comments/${card.source_id}/${sourceId}/${encodeURIComponent(filename)}`;
  await env.PRODUCTION_ARCHIVE.put(r2Key, request.body, { httpMetadata: { contentType } });
  const now = new Date().toISOString();
  const sourceUrl = `/api/admin/production-board/attachments/${encodeURIComponent(sourceId)}`;
  await env.TG_DATA.prepare(`INSERT INTO production_attachments (source_id, card_source_id, comment_source_id, filename, content_type, byte_size, r2_key, source_url, status, source_json, imported_at)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'stored', ?, ?)`).bind(sourceId, card.source_id, filename, contentType, Math.round(size), r2Key, sourceUrl, JSON.stringify({ uploadedBy: session.name, uploadedByEmail: session.email, uploadedAt: now }), now).run();
  return Response.json({ attachment: { sourceId, filename, contentType, byteSize: Math.round(size), url: sourceUrl } }, { status: 201 });
}
