type Context = { request: Request; params: { slug: string } };
function noindexRedirect(target: URL) { const response = Response.redirect(target, 302); response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive'); return response; }
export async function onRequestGet({ request, params }: Context) { const target = new URL('/watch', request.url); target.searchParams.set('collection', params.slug); return noindexRedirect(target); }
export async function onRequestHead(context: Context) { return onRequestGet(context); }
