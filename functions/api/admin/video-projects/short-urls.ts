import { adminResponse, type AdminEnvironment } from '../../../_lib/admin';
import { getMuxLibraryAssets } from '../../../_lib/mux';
import { assignShortVideoUrls } from '../../../_lib/mux-state';

type Context = { request: Request; env: AdminEnvironment };

export async function onRequestPost({ request, env }: Context) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try { return Response.json(await assignShortVideoUrls(env, await getMuxLibraryAssets(env))); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not assign short URLs.' }, { status: 400 }); }
}
