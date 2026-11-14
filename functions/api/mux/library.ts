import { adminResponse, type AdminEnvironment } from '../../_lib/admin';
import { readMuxBrowseAssetsById, readMuxLibraryBrowsePage } from '../../_lib/mux-library';
import { readVideoProjectStore } from '../../_lib/mux-state';

type Context = { request: Request; env: AdminEnvironment };

export async function onRequestGet({ request, env }: Context) {
  const denied = await adminResponse(request, env);
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const filters = {
      limit: Number(url.searchParams.get('limit')) || 48,
      cursor: Number(url.searchParams.get('cursor')) || 0,
      query: url.searchParams.get('query') || '',
      client: url.searchParams.get('client') || 'All',
      status: url.searchParams.get('status') || 'all',
      thumbnail: url.searchParams.get('thumbnail') || 'all',
      dateStart: url.searchParams.get('dateStart') || '',
      dateEnd: url.searchParams.get('dateEnd') || '',
    };
    const [page, store] = await Promise.all([readMuxLibraryBrowsePage(env, filters), readVideoProjectStore(env)]);
    const projectByAssetId = new Map(store.projects.flatMap((project) => project.variants.map((variant) => [variant.assetId, project] as const)));
    const linkedIds = new Set(page.pageAssetIds);
    for (const assetId of page.pageAssetIds) {
      const project = projectByAssetId.get(assetId);
      if (!project) continue;
      const collectionId = project.collectionIds[0];
      const linkedProjects = collectionId ? store.projects.filter((item) => item.collectionIds.includes(collectionId)) : [project];
      linkedProjects.flatMap((item) => item.variants).forEach((variant) => linkedIds.add(variant.assetId));
    }
    const linkedAssets = await readMuxBrowseAssetsById(env, linkedIds);
    return Response.json({ ...page, assets: linkedAssets, projects: store.projects, collections: store.collections }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Mux library request failed', error instanceof Error ? error.message : 'Unknown error');
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to read the Mux library.' }, { status: 502, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
