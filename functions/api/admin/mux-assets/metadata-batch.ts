import { adminResponse, type AdminEnvironment } from '../../../_lib/admin';
import { patchMuxMetadataBatch } from '../../../_lib/mux-state';
type Context = { request: Request; env: AdminEnvironment };
export async function onRequestPost({ request, env }: Context) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try { const body = await request.json() as { assetIds?: unknown; client?: unknown; tags?: unknown; status?: unknown }; return Response.json(await patchMuxMetadataBatch(env, body.assetIds, { ...('client' in body ? { client: body.client } : {}), ...('tags' in body ? { tags: body.tags } : {}), ...('status' in body ? { status: body.status } : {}) })); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not update selected videos.' }, { status: 400 }); }
}
