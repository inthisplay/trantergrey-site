import { adminResponse, type AdminEnvironment } from '../../../_lib/admin';
import { deleteMuxAssets, getMuxLibraryAsset } from '../../../_lib/mux';
import { deleteMuxMetadata, replaceVideoAsset } from '../../../_lib/mux-state';

type Context = { request: Request; env: AdminEnvironment };

export async function onRequestPost({ request, env }: Context) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try {
    const body = await request.json() as { assetId?: unknown; replacementAssetId?: unknown };
    if (typeof body.assetId !== 'string' || typeof body.replacementAssetId !== 'string') throw new Error('Choose both the existing and replacement video.');
    const [previousAsset, replacementAsset] = await Promise.all([getMuxLibraryAsset(env, body.assetId), getMuxLibraryAsset(env, body.replacementAssetId)]);
    const project = await replaceVideoAsset(env, previousAsset, replacementAsset);
    await deleteMuxAssets(env, [previousAsset.id]);
    await deleteMuxMetadata(env, [previousAsset.id]);
    return Response.json({ project });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not replace this video.' }, { status: 400 }); }
}
