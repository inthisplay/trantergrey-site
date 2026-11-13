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
type SlateText = { text?: unknown; bold?: unknown; italic?: unknown; underline?: unknown; code?: unknown };
type SlateNode = { type?: unknown; children?: unknown; align?: unknown; assetId?: unknown; attachmentId?: unknown; filename?: unknown; contentType?: unknown; byteSize?: unknown; title?: unknown; client?: unknown; duration?: unknown; thumbnailUrl?: unknown; itemKind?: unknown; href?: unknown; ratioCount?: unknown; videoCount?: unknown; media?: unknown };
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
const slateHtml = (body: unknown) => {
  if (!Array.isArray(body)) return '';
  const renderChildren = (children: unknown): string => {
    if (!Array.isArray(children)) return '';
    return children.map((child) => {
      if (!child || typeof child !== 'object') return '';
      if ('text' in child) {
        const leaf = child as SlateText;
        let value = escapeHtml(typeof leaf.text === 'string' ? leaf.text : '');
        if (leaf.bold) value = `<strong>${value}</strong>`;
        if (leaf.italic) value = `<em>${value}</em>`;
        if (leaf.underline) value = `<u>${value}</u>`;
        if (leaf.code) value = `<code>${value}</code>`;
        return value;
      }
      return renderNode(child as SlateNode);
    }).join('');
  };
  const renderNode = (node: SlateNode): string => {
    if (node.type === 'mux-asset') {
      const assetId = typeof node.assetId === 'string' ? node.assetId.trim() : '';
      if (!/^[A-Za-z0-9_-]{6,}$/u.test(assetId)) return '';
      const kind = node.itemKind === 'collection' || node.itemKind === 'ratio-group' ? node.itemKind : 'video';
      const href = typeof node.href === 'string' && (/^\/watch\/[A-Za-z0-9-]+$/u.test(node.href) || /^\/watch\/collection\/[A-Za-z0-9-]+$/u.test(node.href)) ? node.href : `/watch/${encodeURIComponent(assetId)}`;
      const title = escapeHtml(typeof node.title === 'string' ? node.title.slice(0, 240) : 'Mux video');
      const client = typeof node.client === 'string' && node.client.trim() ? `<small>${escapeHtml(node.client.slice(0, 120))}</small>` : '';
      const seconds = typeof node.duration === 'number' && Number.isFinite(node.duration) ? Math.max(0, Math.round(node.duration)) : null;
      const duration = seconds === null ? 'Mux video' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      const thumbnail = typeof node.thumbnailUrl === 'string' && /^https:\/\/image\.mux\.com\//i.test(node.thumbnailUrl) ? `<img src="${escapeHtml(node.thumbnailUrl)}" alt="">` : '';
      const count = kind === 'collection' ? Math.max(0, Math.round(Number(node.videoCount) || 0)) : Math.max(0, Math.round(Number(node.ratioCount) || 0));
      const typeLabel = kind === 'collection' ? `Collection · ${count} videos` : kind === 'ratio-group' ? `Ratio group · ${count} ratios` : duration;
      const media = Array.isArray(node.media) ? node.media.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const video = entry as { playerUrl?: unknown; title?: unknown };
        if (typeof video.playerUrl !== 'string' || !/^https:\/\/player\.mux\.com\/[A-Za-z0-9_-]+(?:\?[^"'<>]*)?$/u.test(video.playerUrl)) return [];
        return [{ playerUrl: escapeHtml(video.playerUrl), title: escapeHtml(typeof video.title === 'string' ? video.title.slice(0, 240) : 'Mux video') }];
      }) : [];
      const preview = media.length
        ? `<div class="production-comment-mux-asset-videos">${media.map((video) => `<iframe src="${video.playerUrl}" title="${video.title}" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`).join('')}</div>`
        : thumbnail ? `<div class="production-comment-mux-asset-fallback">${thumbnail}</div>` : '';
      return `<div class="production-comment-mux-asset">${preview}<div class="production-comment-mux-asset-caption">${client}<strong>${title}</strong><em>${typeLabel}</em></div><a class="production-comment-mux-asset-public-link" href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener">Open public page ↗</a></div>`;
    }
    if (node.type === 'attachment') {
      const attachmentId = typeof node.attachmentId === 'string' ? node.attachmentId : '';
      if (!/^local-attachment-[A-Za-z0-9-]{20,}$/u.test(attachmentId)) return '';
      const filename = escapeHtml(typeof node.filename === 'string' ? node.filename.slice(0, 180) : 'Attachment');
      const contentType = typeof node.contentType === 'string' ? node.contentType.toLowerCase() : 'application/octet-stream';
      const href = `/api/admin/production-board/attachments/${encodeURIComponent(attachmentId)}`;
      const media = contentType.startsWith('image/') ? `<img src="${href}" alt="${filename}">` : contentType.startsWith('video/') ? `<video controls preload="metadata" src="${href}"></video>` : contentType.startsWith('audio/') ? `<audio controls preload="metadata" src="${href}"></audio>` : '';
      return `<figure class="production-comment-upload">${media}<figcaption><a href="${href}" target="_blank" rel="noreferrer noopener">${filename}</a></figcaption></figure>`;
    }
    const children = renderChildren(node.children);
    if (!children) return '';
    const alignment = ['left', 'center', 'right', 'justify'].includes(String(node.align)) ? ` style="text-align:${node.align}"` : '';
    if (node.type === 'heading-one') return `<h2${alignment}>${children}</h2>`;
    if (node.type === 'heading-two') return `<h3${alignment}>${children}</h3>`;
    if (node.type === 'block-quote') return `<blockquote${alignment}>${children}</blockquote>`;
    if (node.type === 'bulleted-list') return `<ul>${children}</ul>`;
    if (node.type === 'numbered-list') return `<ol>${children}</ol>`;
    if (node.type === 'list-item') return `<li>${children}</li>`;
    return `<p${alignment}>${children}</p>`;
  };
  return body.map((node) => node && typeof node === 'object' ? renderNode(node as SlateNode) : '').join('');
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
