import { adminResponse, type AdminEnvironment } from '../../../_lib/admin';
import { detachAssetsFromVideoPages } from '../../../_lib/mux-state';

type Context = { request: Request; env: AdminEnvironment };

export async function onRequestPost({ request, env }: Context) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try {
    const body = await request.json() as { assetIds?: unknown };
    const assetIds = Array.isArray(body.assetIds) ? [...new Set(body.assetIds.filter((id): id is string => typeof id === 'string' && /^[A-Za-z0-9]+$/.test(id)))] : [];
    if (!assetIds.length) throw new Error('Select at least one video.');
    return Response.json(await detachAssetsFromVideoPages(env, assetIds));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not remove these videos from their shareable pages.' }, { status: 400 }); }
}
