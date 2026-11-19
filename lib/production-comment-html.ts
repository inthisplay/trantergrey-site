import { safeCommentMediaUrl } from './comment-media';
import { uiIconMarkup } from './ui-icons';
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
type SlateText = { text?: unknown; bold?: unknown; italic?: unknown; underline?: unknown; code?: unknown };
type SlateNode = { url?: unknown; mediaKind?: unknown; type?: unknown; children?: unknown; align?: unknown; assetId?: unknown; attachmentId?: unknown; filename?: unknown; contentType?: unknown; byteSize?: unknown; title?: unknown; client?: unknown; duration?: unknown; thumbnailUrl?: unknown; itemKind?: unknown; href?: unknown; ratioCount?: unknown; videoCount?: unknown; media?: unknown };
export const slateHtml = (body: unknown) => {
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
      return `<div class="production-comment-mux-asset">${preview}<div class="production-comment-mux-asset-caption">${client}<strong>${title}</strong><em>${typeLabel}</em></div><div class="production-comment-mux-actions"><a class="production-comment-mux-asset-public-link" href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener">Open public page ${uiIconMarkup('external')}</a><button type="button" data-copy-public-link="${escapeHtml(href)}">Copy public link</button></div></div>`;
    }
    if (node.type === 'comment-media') {
      const url = typeof node.url === 'string' ? node.url : '';
      const kind = String(node.mediaKind || '');
      if (!['image', 'video'].includes(kind) || !safeCommentMediaUrl(url, kind)) return '';
      const label = escapeHtml(typeof node.title === 'string' ? node.title.slice(0, 240) : 'Media');
      const src = escapeHtml(url);
      return `<figure class="production-comment-upload">${kind === 'image' ? `<img src="${src}" alt="${label}">` : `<video controls preload="metadata" src="${src}" title="${label}"></video>`}<figcaption><a href="${src}" target="_blank" rel="noreferrer noopener">${label}</a></figcaption></figure>`;
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
