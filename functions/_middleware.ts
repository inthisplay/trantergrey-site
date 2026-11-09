type Context = { request: Request; next: () => Promise<Response> };

const noindexPaths = new Set(['/watch', '/showcase', '/work']);

export async function onRequest({ request, next }: Context) {
  const response = await next();
  const pathname = new URL(request.url).pathname;
  if (noindexPaths.has(pathname) || pathname.startsWith('/watch/')) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }
  return response;
}
