import type { AdminEnvironment } from '../../_lib/admin';
import { publicWatchData } from '../../_lib/mux-public';

type Context = { env: AdminEnvironment; params: { slug: string } };
export async function onRequestGet({ env, params }: Context) {
  try { const video = await publicWatchData(env, params.slug); return video ? Response.json({ video }, { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } }) : Response.json({ error: 'Video not found.' }, { status: 404 }); }
  catch { return Response.json({ error: 'This video is temporarily unavailable.' }, { status: 502 }); }
}
