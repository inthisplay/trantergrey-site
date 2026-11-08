type Context = { request: Request; params: { id: string } };

export async function onRequestGet({ request, params }: Context) {
  const target = new URL('/mux-asset', request.url);
  target.searchParams.set('id', params.id);
  return Response.redirect(target, 302);
}

export async function onRequestHead(context: Context) {
  return onRequestGet(context);
}
