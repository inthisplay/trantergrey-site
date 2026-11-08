import type { AdminEnvironment } from '../_lib/admin';
import { publicShowcaseData } from '../_lib/mux-public';

type Context = { request: Request; env: AdminEnvironment };
export async function onRequestGet({ request, env }: Context) {
  const seen = new Set<string>(); const ids = (new URL(request.url).searchParams.get('videos') || '').split(',').map((id) => id.trim()).filter((id) => /^[A-Za-z0-9]+$/.test(id) && !seen.has(id) && Boolean(seen.add(id))).slice(0, 100);
  try { return Response.json({ assets: await publicShowcaseData(env, ids) }, { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } }); }
  catch { return Response.json({ error: 'This showcase is temporarily unavailable.' }, { status: 502 }); }
}
