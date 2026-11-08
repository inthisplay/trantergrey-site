import { adminResponse, type AdminEnvironment } from '../../../_lib/admin';
import { patchMuxMetadata } from '../../../_lib/mux-state';

type Context = { request: Request; env: AdminEnvironment };
export async function onRequestPost({ request, env }: Context) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try {
    const body = await request.json() as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const key of ['title', 'tags', 'status', 'downloadsEnabled'] as const) if (key in body) patch[key] = body[key];
    return Response.json(await patchMuxMetadata(env, body.assetId, patch));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not update that video.' }, { status: 400 }); }
}
