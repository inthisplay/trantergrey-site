type Context = { request: Request; params: { slug: string } };

export async function onRequestGet({ request, params }: Context) {
  const target = new URL('/app/watch', request.url);
  target.searchParams.set('slug', params.slug);
  return Response.redirect(target, 302);
}

export async function onRequestHead(context: Context) { return onRequestGet(context); }
