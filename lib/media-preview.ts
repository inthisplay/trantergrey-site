/** Render-only variants: saved URLs and download links always identify the original. */
export function mediaVariantUrl(url: string, variant: 'thumb' | 'preview' | 'poster'): string {
  if (!/^\/api\/admin\/(?:rolodex\/media\/[^/?#]+|production-board\/(?:attachments\/[^/?#]+|[^/?#]+\/gallery\/[^/?#]+))(?:[?#]|$)/.test(url)) return url;
  const parsed = new URL(url, 'https://local.invalid');
  parsed.searchParams.set('variant', variant);
  parsed.hash = '';
  return parsed.pathname + parsed.search;
}
export function mediaPosterUrl(url: string): string | undefined {
  const poster = mediaVariantUrl(url, 'poster');
  return poster === url ? undefined : poster;
}
