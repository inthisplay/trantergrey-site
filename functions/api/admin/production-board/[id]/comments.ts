import { slateHtml } from '../../../../../lib/production-comment-html';
import { adminResponse, adminSession, type AdminEnvironment } from '../../../../_lib/admin';
import { addProductionComment } from '../../../../_lib/production-commands';

type Context = { request: Request; env: AdminEnvironment; params: { id: string } };
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const sanitizeCommentHtml = (value: string) => value.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]*>/g, (tag) => {
  if (/^<\/?(?:strong|b|em|i|ul|ol|li|br|p)\s*\/?>$/i.test(tag)) return tag;
  const anchor = tag.match(/^<a\s+href=(['"])(https?:\/\/[^'"\s<>]+|mailto:[^'"\s<>]+)\1\s*>$/i);
  return anchor ? `<a href="${escapeHtml(anchor[2])}" rel="noreferrer noopener" target="_blank">` : '';
});
type EditorBlock = { type?: unknown; data?: unknown };
type EditorPayload = { blocks?: unknown };
const editorHtml = (body: EditorPayload) => {
  if (!Array.isArray(body.blocks)) return '';
  const inline = (value: unknown) => sanitizeCommentHtml(typeof value === 'string' ? value : '');
  const listItems = (items: unknown, nested = false): string => {
    if (!Array.isArray(items)) return '';
    const rendered = items.map((item) => {
      if (typeof item === 'string') return `<li>${inline(item)}</li>`;
      if (!item || typeof item !== 'object') return '';
      const entry = item as { content?: unknown; items?: unknown };
      return `<li>${inline(entry.content)}${listItems(entry.items, true)}</li>`;
    }).join('');
    return rendered ? `${nested ? '<ul>' : ''}${rendered}${nested ? '</ul>' : ''}` : '';
  };
  return (body.blocks as EditorBlock[]).map((block) => {
    const data = block.data && typeof block.data === 'object' ? block.data as Record<string, unknown> : {};
    if (block.type === 'paragraph') return `<p>${inline(data.text)}</p>`;
    if (block.type === 'header') return `<p><strong>${inline(data.text)}</strong></p>`;
    if (block.type === 'list') {
      const style = data.style === 'ordered' ? 'ol' : 'ul';
      const items = listItems(data.items);
      return items ? `<${style}>${items}</${style}>` : '';
    }
    return '';
  }).join('');
};

export async function onRequestPost({ request, env, params }: Context): Promise<Response> {
  const denied = await adminResponse(request, env); if (denied) return denied;
  const session = await adminSession(request, env);
  if (!session) return Response.json({ error: 'Sign in to add a comment.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { body?: unknown } | null;
  if (!body || !body.body || typeof body.body !== 'object') return Response.json({ error: 'Enter a comment.' }, { status: 400 });
  const bodyJson = JSON.stringify(body.body); const bodyHtml = Array.isArray(body.body) ? slateHtml(body.body) : editorHtml(body.body as EditorPayload);
  try { return Response.json({ localComment: await addProductionComment(env, params.id, { bodyHtml, bodyJson }, session) }, { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unable to add this comment.' }, { status: 400 }); }
}

async function editableComment(request: Request, env: AdminEnvironment, cardId: string, commentId: unknown) {
  const denied = await adminResponse(request, env); if (denied) return { denied };
  const session = await adminSession(request, env); if (!session) return { denied: Response.json({ error: 'Sign in to edit comments.' }, { status: 401 }) };
  if (typeof commentId !== 'string' || !/^[A-Za-z0-9-]{20,}$/u.test(commentId)) return { denied: Response.json({ error: 'Choose a valid comment.' }, { status: 400 }) };
  const comment = await env.TG_DATA.prepare(`SELECT plc.id, plc.author_name AS authorName, plc.author_email AS authorEmail, plc.deleted_at AS deletedAt
    FROM production_local_comments plc JOIN production_cards p ON p.source_id = plc.card_source_id
    WHERE p.id = ? AND plc.id = ?`).bind(cardId, commentId).first<{ id: string; authorName: string; authorEmail: string | null; deletedAt: string | null }>();
  if (!comment) return { denied: Response.json({ error: 'Comment not found.' }, { status: 404 }) };
  const ownsComment = comment.authorEmail ? session.email?.toLowerCase() === comment.authorEmail.toLowerCase() : session.name === comment.authorName;
  if (!ownsComment) return { denied: Response.json({ error: 'You can only change your own comments.' }, { status: 403 }) };
  if (comment.deletedAt) return { denied: Response.json({ error: 'This comment was already deleted.' }, { status: 409 }) };
  return { comment, session };
}

export async function onRequestPatch({ request, env, params }: Context): Promise<Response> {
  const body = await request.json().catch(() => null) as { commentId?: unknown; body?: unknown } | null;
  const access = await editableComment(request, env, params.id, body?.commentId); if (access.denied) return access.denied;
  if (!body?.body || typeof body.body !== 'object') return Response.json({ error: 'Enter a comment.' }, { status: 400 });
  const bodyJson = JSON.stringify(body.body); const bodyHtml = Array.isArray(body.body) ? slateHtml(body.body) : editorHtml(body.body as EditorPayload);
  if (!bodyHtml.replace(/<[^>]*>/g, '').trim() || bodyJson.length > 10000) return Response.json({ error: 'Enter a comment under 10,000 characters.' }, { status: 400 });
  await env.TG_DATA.prepare('UPDATE production_local_comments SET body_html = ?, body_json = ? WHERE id = ?').bind(bodyHtml, bodyJson, access.comment.id).run();
  const updated = await env.TG_DATA.prepare('SELECT id, body_html AS bodyHtml, body_json AS bodyJson, author_name AS authorName, author_email AS authorEmail, created_at AS createdAt, deleted_at AS deletedAt, deleted_by_name AS deletedByName FROM production_local_comments WHERE id = ?').bind(access.comment.id).first();
  return Response.json({ localComment: updated });
}

export async function onRequestDelete({ request, env, params }: Context): Promise<Response> {
  const body = await request.json().catch(() => null) as { commentId?: unknown } | null;
  const access = await editableComment(request, env, params.id, body?.commentId); if (access.denied) return access.denied;
  const deletedAt = new Date().toISOString();
  await env.TG_DATA.prepare('UPDATE production_local_comments SET body_html = \'\', body_json = NULL, deleted_at = ?, deleted_by_name = ? WHERE id = ?').bind(deletedAt, access.session.name, access.comment.id).run();
  const localComment = await env.TG_DATA.prepare('SELECT id, body_html AS bodyHtml, body_json AS bodyJson, author_name AS authorName, author_email AS authorEmail, created_at AS createdAt, deleted_at AS deletedAt, deleted_by_name AS deletedByName FROM production_local_comments WHERE id = ?').bind(access.comment.id).first();
  return Response.json({ localComment });
}
