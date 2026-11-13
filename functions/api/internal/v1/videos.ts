import { apiData, apiError, page, requireApiScope } from '../../../_lib/internal-api';
import { readEnrichedMuxLibrary } from '../../../_lib/mux-library';
import type { AdminEnvironment } from '../../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const access = await requireApiScope(request, env, 'videos:read'); if (access instanceof Response) return access;
  try {
    const { limit, cursor, query } = page(request);
    const url = new URL(request.url);
    const client = url.searchParams.get('client')?.trim().toLocaleLowerCase() || '';
    const status = url.searchParams.get('status') || '';
    const createdAfter = url.searchParams.get('createdAfter') || '';
    const linked = url.searchParams.get('linked');
    const [library, linkRows] = await Promise.all([
      readEnrichedMuxLibrary(env),
      env.TG_DATA.prepare('SELECT asset_id AS assetId, COUNT(*) AS count FROM production_card_video_links GROUP BY asset_id').all<{ assetId: string; count: number }>(),
    ]);
    const linkCount = new Map(linkRows.results.map((row) => [row.assetId, row.count]));
    const videos = library.assets.filter((asset) => {
      const haystack = [asset.title, asset.client || '', ...asset.localTags].join(' ').toLocaleLowerCase();
      const isLinked = (linkCount.get(asset.id) || 0) > 0;
      return (!query || haystack.includes(query)) && (!client || (asset.client || '').toLocaleLowerCase().includes(client))
        && (!status || asset.libraryStatus === status) && (!createdAfter || Boolean(asset.createdAt && asset.createdAt > createdAfter))
        && (linked === null || (linked === 'true') === isLinked);
    }).map((asset) => ({
      id: asset.id, title: asset.title, client: asset.client, tags: asset.localTags, status: asset.libraryStatus,
      createdAt: asset.createdAt, uploader: asset.creatorId ? { id: asset.creatorId } : null,
      duration: asset.duration, playbackId: asset.playbackId, playbackPolicy: asset.playbackPolicy,
      playerUrl: asset.playerUrl, thumbnailUrl: asset.thumbnailUrl, projectId: library.projects.find((project) => project.variants.some((variant) => variant.assetId === asset.id))?.id || null,
      linkedCardCount: linkCount.get(asset.id) || 0,
    }));
    const start = cursor ? Math.max(0, videos.findIndex((video) => video.id === cursor) + 1) : 0;
    const items = videos.slice(start, start + limit);
    return apiData(items, { nextCursor: items.length === limit ? items.at(-1)?.id || null : null });
  } catch (error) { return apiError('video_list_failed', error instanceof Error ? error.message : 'Unable to load videos.', 502); }
}
