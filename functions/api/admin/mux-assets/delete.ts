import { adminResponse, type AdminEnvironment } from '../../../_lib/admin';
import { deleteMuxAssets } from '../../../_lib/mux';
import { deleteMuxMetadata, readVideoProjectStore } from '../../../_lib/mux-state';

type Context = { request: Request; env: AdminEnvironment };
export async function onRequestPost({ request, env }: Context) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try {
    const body = await request.json() as { assetIds?: unknown };
    const ids = Array.isArray(body.assetIds) ? [...new Set(body.assetIds.filter((id): id is string => typeof id === 'string' && /^[A-Za-z0-9]+$/.test(id)))] : [];
    if (!ids.length) throw new Error('Select at least one video.');
    const protectedIds = new Set((await readVideoProjectStore(env)).projects.flatMap((project) => project.variants.map((variant) => variant.assetId)));
    if (ids.some((id) => protectedIds.has(id))) throw new Error('Remove selected videos from their shareable pages before deleting them.');
    await deleteMuxAssets(env, ids); await deleteMuxMetadata(env, ids);
    return Response.json({ deleted: ids });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not delete the selected videos.' }, { status: 400 }); }
}
