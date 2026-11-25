import type { AdminEnvironment } from './_lib/admin';
import { integrationRequest } from './_lib/integration-request';
import { watchPreview } from './_lib/watch-preview';
import { isUnlistedPath, unlistedRobots } from '../lib/search-visibility.mjs';
import { requestSafety } from './_lib/request-safety';
import { recordIntegrationEvent, operationLabel } from './_lib/integration-health';

type RewriteElement = {
  setInnerContent(value: string): void;
  append(value: string, options: { html: boolean }): void;
};

declare const HTMLRewriter: new () => {
  on(selector: string, handler: { element(element: RewriteElement): void }): InstanceType<typeof HTMLRewriter>;
  transform(response: Response): Response;
};

type Context = { request: Request; env: AdminEnvironment; next: () => Promise<Response> };

export async function onRequest({ request, env, next }: Context) {
  const url = new URL(request.url);
  const monitored = ['/api/admin/inbox','/api/admin/client-hq','/api/admin/client-hq-files','/api/admin/mcp-connections','/api/admin/integration-health'].includes(url.pathname);
  let response: Response;
  try {
    response = await requestSafety(request, env) ?? (monitored ? await integrationRequest({ request, env, next }) : await next());
    if (response.status >= 500 && url.pathname.startsWith('/api/') && !monitored && !url.pathname.startsWith('/api/internal/')) {
      const reference = await recordIntegrationEvent(env, 'api', operationLabel(url.pathname), 'server_error', response.status);
      response = Response.json({ error: `This service is temporarily unavailable. Check current state before retrying a change. Reference: ${reference}` }, { status: response.status, headers: { 'Cache-Control': 'private, no-store' } });
    }
  } catch (error) {
    if (!url.pathname.startsWith('/api/')) throw error;
    const reference = crypto.randomUUID();
    await recordIntegrationEvent(env, 'api', operationLabel(url.pathname), 'server_error', 503, reference);
    return Response.json({ error: `This service is temporarily unavailable. Please try again. Reference: ${reference}` }, { status: 503, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': unlistedRobots } });
  }
  const pathname = url.pathname;
  if (!isUnlistedPath(pathname)) return response;

  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', unlistedRobots);
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
