type Context = { request: Request; params: { slug: string } };

export async function onRequestGet({ request, params }: Context) {
  const target = new URL('/watch-u', request.url);
  target.searchParams.set('slug', params.slug);
  return fetch(target);
}

export async function onRequestHead(context: Context) { return onRequestGet(context); }
