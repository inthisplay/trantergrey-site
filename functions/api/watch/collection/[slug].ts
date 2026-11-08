import type { AdminEnvironment } from '../../../_lib/admin';
import { publicCollectionData } from '../../../_lib/mux-public';

type Context = { env: AdminEnvironment; params: { slug: string } };
export async function onRequestGet({ env, params }: Context) {
  try { const collection = await publicCollectionData(env, params.slug); return collection ? Response.json(collection, { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } }) : Response.json({ error: 'Collection not found.' }, { status: 404 }); }
  catch { return Response.json({ error: 'This collection is temporarily unavailable.' }, { status: 502 }); }
}
