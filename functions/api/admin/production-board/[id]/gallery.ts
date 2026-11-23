import { prepareMediaPreviews } from '../../../../_lib/media-previews';
import { adminResponse, adminSession, type AdminEnvironment } from '../../../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment; params: { id: string } };
const types = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'video/mp4', 'video/webm', 'video/quicktime']);
const limit = 90 * 1024 * 1024;
const fail = (error: string, status = 400) => Response.json({ error }, { status });

export async function onRequest({ request, env, params }: Context): Promise<Response> {
  const denied = await adminResponse(request, env); if (denied) return denied;
  if (request.method !== 'GET' && request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return fail('Invalid request origin.', 403);
  const card = await env.TG_DATA.prepare(`SELECT p.source_id FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id=p.source_id WHERE p.id=? AND o.deleted_at IS NULL`).bind(params.id).first<{ source_id: string }>();
  if (!card) return fail('Card not found.', 404);
  const session = (await adminSession(request, env))!;
  const now = new Date().toISOString();
  if (request.method === 'GET') {
    const { results } = await env.TG_DATA.prepare(`SELECT id, (SELECT p.id FROM rolodex_people p WHERE p.deleted_at IS NULL AND (p.id=production_gallery.rolodex_person_id OR p.id IN (SELECT m.person_id FROM rolodex_media m WHERE m.source_gallery_id=production_gallery.id AND m.deleted_at IS NULL)) LIMIT 1) AS rolodexPersonId, (SELECT m.id FROM rolodex_media m JOIN rolodex_people p ON p.id=m.person_id WHERE m.deleted_at IS NULL AND p.deleted_at IS NULL AND m.r2_key=production_gallery.r2_key AND (m.person_id=production_gallery.rolodex_person_id OR m.source_gallery_id=production_gallery.id) ORDER BY m.id LIMIT 1) AS rolodexMediaId, title, filename, content_type AS contentType, tags_json, approved_at AS approvedAt, approved_by AS approvedBy, created_at AS createdAt FROM production_gallery WHERE card_source_id=? AND deleted_at IS NULL ORDER BY (approved_at IS NOT NULL) DESC, created_at DESC, id`).bind(card.source_id).all<{ tags_json: string; id: string }>();
    return Response.json({ items: results.map(({ tags_json, ...item }) => ({ ...item, tags: JSON.parse(tags_json), url: `/api/admin/production-board/${encodeURIComponent(params.id)}/gallery/${item.id}` })) }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  if (request.method === 'POST') {
    if (!env.PRODUCTION_ARCHIVE) return fail('Media storage is unavailable.', 503);
    const contentType = (request.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!types.has(contentType)) return fail('Choose a JPG, PNG, WebP, GIF, AVIF, MP4, WebM, or MOV file.', 415);
    const size = Number(request.headers.get('x-file-size'));
    if (!Number.isInteger(size) || size < 1 || size > limit) return fail('Files must be between 1 byte and 90 MB.', 413);
    let filename: string;
    try { filename = decodeURIComponent(request.headers.get('x-file-name') || 'Media').replace(/[\\/\0]/g, '-').slice(0, 180); } catch { return fail('Invalid filename.'); }
    const reader = request.body?.getReader(); if (!reader) return fail('Choose a file.');
    const buffer = new Uint8Array(size); let bytes = 0;
    while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > limit || bytes > size) { await reader.cancel(); return fail('File exceeds the declared upload size.', 413); } buffer.set(chunk.value, bytes - chunk.value.byteLength); }
    if (bytes !== size) return fail('Upload was incomplete. Please retry.');
    const id = crypto.randomUUID(); const key = `gallery/${card.source_id}/${id}`;
    await env.PRODUCTION_ARCHIVE.put(key, buffer, { httpMetadata: { contentType } });
    await env.TG_DATA.prepare(`INSERT INTO production_gallery (id,card_source_id,filename,content_type,byte_size,r2_key,title,uploaded_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id, card.source_id, filename, contentType, bytes, key, filename.replace(/\.[^.]+$/, '') || filename, session.email || session.name, now, now).run();
    await prepareMediaPreviews(env, key, contentType);
    return Response.json({ id }, { status: 201 });
  }
  if (!['PATCH', 'DELETE'].includes(request.method)) return fail('Method not allowed.', 405);
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== 'string') return fail('Choose a gallery item.');
  const item = await env.TG_DATA.prepare('SELECT id FROM production_gallery WHERE id=? AND card_source_id=? AND deleted_at IS NULL').bind(body.id, card.source_id).first();
  if (!item) return fail('Gallery item not found.', 404);
  if (request.method === 'DELETE') {
    await env.TG_DATA.prepare('UPDATE production_gallery SET deleted_at=?,updated_at=? WHERE id=? AND card_source_id=?').bind(now, now, body.id, card.source_id).run();
  } else {
    const updates: string[] = []; const values: unknown[] = [];
    if ('title' in body) { if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 180) return fail('Enter a title of 1–180 characters.'); updates.push('title=?'); values.push(body.title.trim()); }
    if ('tags' in body) {
      if (!Array.isArray(body.tags) || body.tags.length > 20 || body.tags.some((t: unknown) => typeof t !== 'string' || t.trim().length > 50)) return fail('Use up to 20 tags, each 50 characters or fewer.');
      const tags = [...new Set(body.tags.map((t: string) => t.trim().toLowerCase()).filter(Boolean))]; updates.push('tags_json=?'); values.push(JSON.stringify(tags));
    }
    if ('approved' in body) { if (typeof body.approved !== 'boolean') return fail('Invalid approval.'); updates.push('approved_at=?', 'approved_by=?'); values.push(body.approved ? now : null, body.approved ? session.name : null); }
    if (!updates.length) return fail('No changes supplied.');
    await env.TG_DATA.prepare(`UPDATE production_gallery SET ${updates.join(',')},updated_at=? WHERE id=? AND card_source_id=?`).bind(...values, now, body.id, card.source_id).run();
  }
  return Response.json({ ok: true });
}
