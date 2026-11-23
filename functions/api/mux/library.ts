import { adminResponse, type AdminEnvironment } from '../../_lib/admin';
import { readEnrichedMuxLibrary, readMuxBrowseAssetsById, readMuxLibraryBrowsePage } from '../../_lib/mux-library';
import { readVideoProjectStore } from '../../_lib/mux-state';
import type { MatchedMuxLibraryAsset } from '../../../lib/mux-matching';
import type { VideoProject } from '../../../lib/video-projects-shared';

type Context = { request: Request; env: AdminEnvironment };

type CommentItem = {
  id: string; kind: 'video' | 'ratio-group' | 'collection'; title: string; client: string | null; duration: number;
  thumbnailUrl: string | null; playerUrl: string | null; href: string; ratioCount?: number; videoCount?: number;
  clients?: string[]; children?: CommentItem[];
};

function commentVideo(asset: MatchedMuxLibraryAsset, project?: VideoProject): CommentItem {
  return {
    id: asset.id,
    kind: 'video',
    title: project?.title || asset.title,
    client: project?.client || asset.client,
    duration: asset.duration,
    thumbnailUrl: asset.thumbnailUrl,
    playerUrl: asset.playerUrl,
    href: `/watch/${encodeURIComponent(project?.slug || asset.id)}`,
  };
}

function commentItems(assets: MatchedMuxLibraryAsset[], projects: VideoProject[], collections: Array<{ id: string; name: string; slug: string }>) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const projectItems = projects.flatMap((project) => {
    const children = project.variants
      .slice().sort((first, second) => first.order - second.order)
      .flatMap(({ assetId }) => {
        const asset = byId.get(assetId);
        return asset ? [commentVideo(asset, project)] : [];
      });
    if (!children.length) return [];
    if (children.length === 1) return children;
    return [{
      ...children[0], id: project.id, kind: 'ratio-group' as const, title: project.title, client: project.client,
      href: `/watch/${encodeURIComponent(project.slug)}`, ratioCount: children.length, children,
    }];
  });
  const assignedAssetIds = new Set(projects.flatMap((project) => project.variants.map((variant) => variant.assetId)));
  const looseItems = assets.filter((asset) => !assignedAssetIds.has(asset.id)).map((asset) => commentVideo(asset));
  const collectionItems = collections.flatMap((collection) => {
    const children = projects.filter((project) => project.collectionIds.includes(collection.id)).flatMap((project) => project.variants
      .slice().sort((first, second) => first.order - second.order)
      .flatMap(({ assetId }) => {
        const asset = byId.get(assetId);
        return asset ? [commentVideo(asset, project)] : [];
      }));
    if (!children.length) return [];
    const clients = [...new Set(children.map((item) => item.client).filter((client): client is string => Boolean(client)))];
    return [{
      ...children[0], id: collection.id, kind: 'collection' as const, title: collection.name, client: clients.length === 1 ? clients[0] : null,
      href: `/watch/collection/${encodeURIComponent(collection.slug)}`, videoCount: children.length, clients, children,
    }];
  });
  return [...collectionItems, ...projectItems, ...looseItems];
}

export async function onRequestGet({ request, env }: Context) {
  const denied = await adminResponse(request, env);
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('commentItems') === '1') {
      const library = await readEnrichedMuxLibrary(env);
      return Response.json({ commentItems: commentItems(library.assets, library.projects, library.collections) }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const assetId = url.searchParams.get('id')?.trim() || '';
    const collectionId = url.searchParams.get('collection')?.trim() || '';
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
    const [page, store] = await Promise.all([
      assetId
        ? readMuxBrowseAssetsById(env, [assetId]).then((assets) => ({ assets, pageAssetIds: assets.map((asset) => asset.id) }))
        : readMuxLibraryBrowsePage(env, filters),
      readVideoProjectStore(env),
    ]);
    const projectByAssetId = new Map(store.projects.flatMap((project) => project.variants.map((variant) => [variant.assetId, project] as const)));
    const linkedIds = new Set(page.pageAssetIds);
    if (collectionId) {
      store.projects.filter((project) => project.collectionIds.includes(collectionId)).flatMap((project) => project.variants).forEach((variant) => linkedIds.add(variant.assetId));
    }
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
