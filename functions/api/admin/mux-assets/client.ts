import { adminResponse, type AdminEnvironment } from '../../../_lib/admin';
import { patchMuxMetadata } from '../../../_lib/mux-state';

type Context = { request: Request; env: AdminEnvironment };
export async function onRequestPost({ request, env }: Context) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try {
    const body = await request.json() as { assetIds?: unknown; client?: unknown };
    const ids = Array.isArray(body.assetIds) ? [...new Set(body.assetIds.filter((id): id is string => typeof id === 'string' && /^[A-Za-z0-9]+$/.test(id)))] : [];
    if (!ids.length) throw new Error('Select at least one video.');
    const client = typeof body.client === 'string' ? body.client.trim() : ''; if (!client) throw new Error('Enter a client name.');
    await Promise.all(ids.map((id) => patchMuxMetadata(env, id, { client })));
    return Response.json({ assetIds: ids, client });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not assign that client.' }, { status: 400 }); }
}
