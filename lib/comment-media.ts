export type CommentMediaKind = 'image' | 'video' | 'iframe';
export const safeCommentMediaUrl = (url: string, kind: string) => kind === 'iframe'
  ? /^https:\/\/player\.mux\.com\/[A-Za-z0-9_-]+(?:\?[^"'<>\s]*)?$/.test(url)
  : ['image', 'video'].includes(kind) && (/^\/api\/admin\/production-board\/attachments\/[A-Za-z0-9_-]+$/.test(url) || /^https:\/\/[^"'<>\s]+$/.test(url));

// Read only media source attributes, never arbitrary links or client-supplied HTML.
export function commentMediaSources(html: string) {
  const decode = (value: string) => value.replace(/&(?:amp|quot|apos|lt|gt|#39|#x[0-9a-f]+|#[0-9]+);/gi, entity => {
    const named: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&#39;': "'" };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const number = entity.slice(2, -1); const point = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
  });
  return [...html.matchAll(/<(img|video|iframe)\b[^>]*>/gi)].flatMap(match => {
    const attributes = new Map([...match[0].matchAll(/\s([\w-]+)\s*=\s*(["'])(.*?)\2/g)].map(value => [value[1].toLowerCase(), decode(value[3])]));
    const url = attributes.get('src') || '';
    const kind = match[1].toLowerCase() === 'img' ? 'image' : match[1].toLowerCase() as CommentMediaKind;
    return safeCommentMediaUrl(url, kind) ? [{ url, kind, label: attributes.get('alt') || attributes.get('title') || (kind === 'image' ? 'Photo' : 'Video') }] : [];
  });
}
