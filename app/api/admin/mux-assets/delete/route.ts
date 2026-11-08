import { requireAdminApi } from '@/lib/admin-auth';
import { deleteMuxAssets } from '@/lib/mux-api';
import { removeMuxAssetMetadata } from '@/lib/mux-library-metadata';
import { getVideoProjectStore } from '@/lib/video-projects';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  try {
    const body = await request.json() as { assetIds?: unknown };
    const assetIds = Array.isArray(body.assetIds) ? [...new Set(body.assetIds.filter((id): id is string => typeof id === 'string' && /^[A-Za-z0-9]+$/.test(id)))] : [];
    if (!assetIds.length) throw new Error('Select at least one video.');
    const store = await getVideoProjectStore();
    const protectedIds = new Set(store.projects.flatMap((project) => project.variants.map((variant) => variant.assetId)));
    if (assetIds.some((id) => protectedIds.has(id))) throw new Error('Remove selected videos from their shareable pages before deleting them.');
    await deleteMuxAssets(assetIds, { tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET });
    await removeMuxAssetMetadata(assetIds);
    return Response.json({ deleted: assetIds });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not delete the selected videos.' }, { status: 400 });
  }
}
