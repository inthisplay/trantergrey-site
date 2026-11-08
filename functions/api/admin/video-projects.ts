import { adminResponse, type AdminEnvironment } from '../../_lib/admin';
import { getMuxLibraryAssets } from '../../_lib/mux';
import { createVideoProject, deleteVideoProject, readVideoProjectStore } from '../../_lib/mux-state';

type Context = { request: Request; env: AdminEnvironment };
export async function onRequestGet({ request, env }: Context) { const denied = await adminResponse(request, env); return denied || Response.json(await readVideoProjectStore(env)); }
export async function onRequestPost({ request, env }: Context) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try { return Response.json({ project: await createVideoProject(env, await request.json(), await getMuxLibraryAssets(env)) }, { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not create this video project.' }, { status: 400 }); }
}
export async function onRequestDelete({ request, env }: Context) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try { const body = await request.json() as { projectId?: unknown }; return Response.json({ project: await deleteVideoProject(env, body.projectId) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not remove this video page.' }, { status: 400 }); }
}
