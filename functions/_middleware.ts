import type { AdminEnvironment } from './_lib/admin';
import { watchPreview } from './_lib/watch-preview';

type RewriteElement = {
  setInnerContent(value: string): void;
  append(value: string, options: { html: boolean }): void;
};

declare const HTMLRewriter: new () => {
  on(selector: string, handler: { element(element: RewriteElement): void }): InstanceType<typeof HTMLRewriter>;
  transform(response: Response): Response;
};

type Context = { request: Request; env: AdminEnvironment; next: () => Promise<Response> };

const noindexPaths = new Set(['/watch', '/showcase', '/work']);

export async function onRequest({ request, env, next }: Context) {
  const url = new URL(request.url);
  let response: Response;
  try {
    response = await next();
  } catch (error) {
    if (!url.pathname.startsWith('/api/')) throw error;
    const reference = crypto.randomUUID();
    console.error('API request failed', { reference, path: url.pathname, message: error instanceof Error ? error.message : 'Unknown error' });
    return Response.json({ error: `This service is temporarily unavailable. Please try again. Reference: ${reference}` }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
  const pathname = url.pathname;
  if (!noindexPaths.has(pathname) && !pathname.startsWith('/watch/')) return response;

  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  const preview = pathname === '/watch' && response.ok && headers.get('Content-Type')?.includes('text/html')
    ? await watchPreview(env, url).catch(() => null)
    : null;
  if (preview) headers.delete('ETag');

  const page = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  if (!preview) return page;

  const tags = [
    ['og:type', 'website'],
    ['og:site_name', 'TranterGrey'],
    ['og:title', preview.title],
    ['og:description', preview.description],
    ['og:image', preview.image],
    ['og:url', preview.url],
  ];
  return new HTMLRewriter()
    .on('title', { element: (element) => element.setInnerContent(`${preview.title} — TranterGrey`) })
    .on('head', { element: (element) => {
      element.append(tags.map(([key, value]) => `<meta property="${key}" content="${escapeAttribute(value)}">`).join(''), { html: true });
    } })
    .transform(page);
}

function escapeAttribute(value: string) {
  return value.replace(/[&"<>]/g, (character) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[character]!);
}
