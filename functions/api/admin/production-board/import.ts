import { adminResponse, type AdminEnvironment } from '../../../_lib/admin';
import { importProductionSnapshot, type ProductionSnapshot } from '../../../_lib/production-board';
type Context = { request: Request; env: AdminEnvironment };
export async function onRequestPost({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try { return Response.json(await importProductionSnapshot(env, await request.json() as ProductionSnapshot), { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not import snapshot.' }, { status: 400 }); }
}
