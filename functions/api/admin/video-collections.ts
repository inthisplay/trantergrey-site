import { adminResponse, type AdminEnvironment } from '../../_lib/admin';
import { getMuxLibraryAssets } from '../../_lib/mux';
import { createVideoCollection, deleteVideoCollection, readVideoProjectStore, updateVideoCollection } from '../../_lib/mux-state';

type Context = { request: Request; env: AdminEnvironment };
export async function onRequestGet({ request, env }: Context) { const denied = await adminResponse(request, env); return denied || Response.json(await readVideoProjectStore(env)); }
export async function onRequestPost({ request, env }: Context) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try { const result = await createVideoCollection(env, await request.json(), await getMuxLibraryAssets(env)); return Response.json(result, { status: result.reused ? 200 : 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not create this video collection.' }, { status: 400 }); }
}
export async function onRequestPatch({ request, env }: Context) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try { const body = await request.json() as { collectionId?: unknown; name?: unknown; tags?: unknown }; return Response.json({ collection: await updateVideoCollection(env, body.collectionId, { name: body.name, tags: body.tags }) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not update this video collection.' }, { status: 400 }); }
}
export async function onRequestDelete({ request, env }: Context) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try { const body = await request.json() as { collectionId?: unknown }; return Response.json({ collection: await deleteVideoCollection(env, body.collectionId) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not delete this collection.' }, { status: 400 }); }
}
