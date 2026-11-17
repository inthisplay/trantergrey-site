type Context = { request: Request; params: { id: string } };

export async function onRequestGet({ request, params }: Context) {
  const source = new URL(request.url);
  const target = new URL('/mux-asset', request.url);
  target.searchParams.set('id', params.id);
  const collection = source.searchParams.get('collection');
  if (collection) target.searchParams.set('collection', collection);
  return Response.redirect(target, 302);
}

export async function onRequestHead(context: Context) {
  return onRequestGet(context);
}
