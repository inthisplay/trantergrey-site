import { adminResponse, type AdminEnvironment } from '../../_lib/admin';
import { readEnrichedMuxLibrary } from '../../_lib/mux-library';

type Context = { request: Request; env: AdminEnvironment };

export async function onRequestGet({ request, env }: Context) {
  const denied = await adminResponse(request, env);
  if (denied) return denied;
  try {
    const library = await readEnrichedMuxLibrary(env);
    const assetsById = new Map(library.assets.map((asset) => [asset.id, asset]));
    const groupedAssetIds = new Set(library.projects.filter((project) => project.variants.length > 1 || project.collectionIds.length > 0).flatMap((project) => project.variants.map((variant) => variant.assetId)));
    const itemForAsset = (asset: typeof library.assets[number]) => ({
      id: asset.id, kind: 'video' as const, title: asset.title, client: asset.client, duration: asset.duration,
      thumbnailUrl: asset.thumbnailUrl, createdAt: asset.historicCreatedAt || asset.createdAt || null,
      playerUrl: asset.playerUrl, href: `/watch/${encodeURIComponent(asset.id)}`,
    });
    const commentItems = [
      ...library.assets.filter((asset) => !groupedAssetIds.has(asset.id)).map((asset) => ({
        ...itemForAsset(asset),
      })),
      ...library.projects.filter((project) => project.variants.length > 1).map((project) => {
        const firstAsset = assetsById.get(project.variants[0]?.assetId);
        return {
          id: project.id, kind: 'ratio-group' as const, title: project.title, client: project.client,
          duration: firstAsset?.duration || 0, thumbnailUrl: firstAsset?.thumbnailUrl || null, createdAt: project.createdAt,
          href: `/watch/${encodeURIComponent(project.slug)}`, ratioCount: project.variants.length,
          children: project.variants.map((variant) => assetsById.get(variant.assetId)).filter((asset): asset is typeof library.assets[number] => Boolean(asset)).map(itemForAsset),
        };
      }),
      ...library.collections.map((collection) => {
        const projects = library.projects.filter((project) => project.collectionIds.includes(collection.id));
        // Collections may have been assembled from assets before their project-level
        // client was saved. Include the current asset metadata so client filtering
        // still finds those collections (for example, Why I Ring / Salvation Army).
        const clients = [...new Set(projects.flatMap((project) => [
          project.client,
          ...project.variants.map((variant) => assetsById.get(variant.assetId)?.client || null),
        ]).filter((client): client is string => Boolean(client)))];
        const firstAsset = projects.flatMap((project) => project.variants).map((variant) => assetsById.get(variant.assetId)).find(Boolean);
        return {
          id: collection.id, kind: 'collection' as const, title: collection.name, client: clients.length === 1 ? clients[0] : null,
          duration: firstAsset?.duration || 0, thumbnailUrl: firstAsset?.thumbnailUrl || null, createdAt: collection.createdAt,
          href: `/watch/collection/${encodeURIComponent(collection.slug)}`, videoCount: projects.length, clients,
          children: [...new Map(projects.flatMap((project) => project.variants).map((variant) => assetsById.get(variant.assetId)).filter((asset): asset is typeof library.assets[number] => Boolean(asset)).map((asset) => [asset.id, itemForAsset(asset)])).values()],
        };
      }),
    ].sort((left, right) => Date.parse(right.createdAt || '') - Date.parse(left.createdAt || ''));
    return Response.json({ ...library, commentItems }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unable to read the Mux library.' }, { status: 502 }); }
}
