import { adminResponse, type AdminEnvironment } from '../../_lib/admin';
import { readEnrichedMuxLibrary } from '../../_lib/mux-library';

type Context = { request: Request; env: AdminEnvironment };

export async function onRequestGet({ request, env }: Context) {
  const denied = await adminResponse(request, env);
  if (denied) return denied;
  try { return Response.json(await readEnrichedMuxLibrary(env), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unable to read the Mux library.' }, { status: 502 }); }
}
