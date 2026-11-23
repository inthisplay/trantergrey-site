import { adminResponse, adminSession, type AdminEnvironment } from '../../../../_lib/admin';
import { commentMediaSources } from '../../../../../lib/comment-media';
type Context = { request: Request; env: AdminEnvironment; params: { id: string } };
const fail = (error: string, status = 400) => Response.json({ error }, { status });
export async function onRequest({ request, env, params }: Context) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  if (!['GET', 'PATCH', 'POST'].includes(request.method)) return fail('Method not allowed.', 405);
  if (request.method !== 'GET' && request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return fail('Invalid request origin.', 403);
  const body = request.method === 'GET' ? null : await request.json().catch(() => null);
  const commentKey = request.method === 'GET' ? new URL(request.url).searchParams.get('comment') : body?.commentKey;
  if (typeof commentKey !== 'string' || !/^(local|comment)-[A-Za-z0-9-]+$/.test(commentKey)) return fail('Choose a comment.');
  const card = await env.TG_DATA.prepare(`SELECT p.source_id FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id=p.source_id WHERE p.id=? AND o.deleted_at IS NULL`).bind(params.id).first<{ source_id: string }>();
  if (!card) return fail('Card not found.', 404);
  const local = commentKey.startsWith('local-');
  const comment = await env.TG_DATA.prepare(local
    ? 'SELECT body_html FROM production_local_comments WHERE card_source_id=? AND id=? AND deleted_at IS NULL'
    : 'SELECT body_html FROM production_comments WHERE card_source_id=? AND source_id=?')
    .bind(card.source_id, commentKey.slice(local ? 6 : 8)).first<{ body_html: string }>();
  if (!comment) return fail('Comment not found.', 404);
  const media = commentMediaSources(comment.body_html || '').filter(item => item.kind !== 'iframe');
  if (request.method === 'GET') {
    const { results } = await env.TG_DATA.prepare('SELECT media_url AS url, decision, decided_by AS decidedBy, decided_at AS decidedAt FROM production_comment_media_decisions WHERE card_source_id=? AND comment_key=?').bind(card.source_id, commentKey).all<{ url: string }>();
    return Response.json({ decisions: results.filter(entry => media.some(item => item.url === entry.url)) }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  const selected = media.find(item => item.url === body?.url);
  if (!selected) return fail('Media not found in this comment.', 404);
  if (request.method === 'POST') {
    if (body.action !== 'copy') return fail('Unknown action.');
    return Response.json({ block: { type: 'comment-media', url: selected.url, mediaKind: selected.kind, title: selected.label, children: [{ text: '' }] } });
  }
  if (![null, 'highlight', 'reject'].includes(body.decision)) return fail('Choose highlight or reject.');
  if (body.decision === null) {
    await env.TG_DATA.prepare('DELETE FROM production_comment_media_decisions WHERE card_source_id=? AND comment_key=? AND media_url=?').bind(card.source_id, commentKey, selected.url).run();
    return Response.json({ decision: null });
  }
  const session = (await adminSession(request, env))!; const now = new Date().toISOString();
  await env.TG_DATA.prepare(`INSERT INTO production_comment_media_decisions(card_source_id,comment_key,media_url,decision,decided_by,decided_at) VALUES(?,?,?,?,?,?) ON CONFLICT(card_source_id,comment_key,media_url) DO UPDATE SET decision=excluded.decision,decided_by=excluded.decided_by,decided_at=excluded.decided_at`).bind(card.source_id, commentKey, selected.url, body.decision, session.name, now).run();
  return Response.json({ decision: { url: selected.url, decision: body.decision, decidedBy: session.name, decidedAt: now } });
}
