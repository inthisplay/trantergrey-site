import { adminResponse, type AdminEnvironment } from '../../_lib/admin';
import { createCollection, readCollections } from '../../_lib/collections';

type Context = { request: Request; env: AdminEnvironment };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env);
  if (denied) return denied;
  return Response.json({ collections: await readCollections(env) });
}

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { name?: unknown; slug?: unknown; includePublished?: unknown } | null;
  if (!body || typeof body.name !== 'string' || typeof body.slug !== 'string') return Response.json({ error: 'Enter a collection name and share URL.' }, { status: 400 });
  try { return Response.json({ collection: await createCollection(env, { name: body.name, slug: body.slug, includePublished: body.includePublished === true }) }, { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not create this collection.' }, { status: 400 }); }
}
