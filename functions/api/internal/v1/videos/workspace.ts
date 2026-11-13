import { apiData, apiError, requireApiScope } from '../../../../_lib/internal-api';
import { readEnrichedMuxLibrary } from '../../../../_lib/mux-library';
import type { AdminEnvironment } from '../../../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const access = await requireApiScope(request, env, 'videos:read'); if (access instanceof Response) return access;
  try {
    const library = await readEnrichedMuxLibrary(env);
    const asset = (id: string) => {
      const item = library.assets.find((candidate) => candidate.id === id);
      return item ? { id: item.id, title: item.title, client: item.client, thumbnailUrl: item.thumbnailUrl, duration: item.duration, aspectRatio: item.aspectRatio, status: item.libraryStatus, createdAt: item.createdAt } : null;
    };
    const projects = library.projects.map((project) => ({ id: project.id, title: project.title, slug: project.slug, client: project.client, collectionIds: project.collectionIds, variants: project.variants.map((variant) => ({ ...variant, asset: asset(variant.assetId) })).filter((variant) => variant.asset !== null) }));
    const groupedIds = new Set(library.projects.flatMap((project) => project.variants.map((variant) => variant.assetId)));
    return apiData({ collections: library.collections, projects, ungrouped: library.assets.filter((item) => !groupedIds.has(item.id)).map((item) => asset(item.id)) });
  } catch (error) { return apiError('video_workspace_failed', error instanceof Error ? error.message : 'Unable to load the video workspace.', 502); }
}
