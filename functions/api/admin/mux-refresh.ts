import { adminResponse, type AdminEnvironment } from '../../_lib/admin';
import { refreshMuxLibraryCatalog } from '../../_lib/mux-library';

type Context = { request: Request; env: AdminEnvironment };

/** Manually rebuild the Mux snapshot and compact browse index for an authenticated admin. */
export async function onRequestPost({ request, env }: Context) {
  const denied = await adminResponse(request, env);
  if (denied) return denied;

  try {
    const result = await refreshMuxLibraryCatalog(env);
    return Response.json({ ok: true, assetCount: result.assetCount });
  } catch (error) {
    console.error('Manual Mux library refresh failed', error);
    return Response.json({ error: 'Could not refresh the Mux cache.' }, { status: 502 });
  }
}
