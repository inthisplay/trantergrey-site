import { apiData, apiError, requireApiScope } from '../../../../_lib/internal-api';
import { readEnrichedMuxLibrary } from '../../../../_lib/mux-library';
import type { AdminEnvironment } from '../../../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment; params: { id: string } };

export async function onRequestGet({ request, env, params }: Context): Promise<Response> {
  const access = await requireApiScope(request, env, 'videos:read'); if (access instanceof Response) return access;
  if (!/^[A-Za-z0-9]+$/.test(params.id)) return apiError('invalid_video_id', 'Choose a valid Mux asset ID.', 400);
  try {
    const [library, links, ingest] = await Promise.all([
      readEnrichedMuxLibrary(env),
      env.TG_DATA.prepare('SELECT card_id AS cardId, linked_at AS linkedAt FROM production_card_video_links WHERE asset_id = ? ORDER BY linked_at DESC').bind(params.id).all<{ cardId: string; linkedAt: string }>(),
      env.TG_DATA.prepare('SELECT requested_at AS requestedAt, uploader_name AS uploaderName, uploader_email AS uploaderEmail FROM mux_asset_ingests WHERE asset_id = ?').bind(params.id).first<{ requestedAt: string; uploaderName: string | null; uploaderEmail: string | null }>(),
    ]);
    const asset = library.assets.find((item) => item.id === params.id);
    if (!asset) return apiError('video_not_found', 'Video not found.', 404);
    const project = library.projects.find((item) => item.variants.some((variant) => variant.assetId === asset.id));
    return apiData({ ...asset, project: project ? { id: project.id, title: project.title, slug: project.slug, client: project.client } : null, links: links.results, ingest: ingest ? { uploadedAt: ingest.requestedAt, uploader: { name: ingest.uploaderName, email: ingest.uploaderEmail } } : null });
  } catch (error) { return apiError('video_read_failed', error instanceof Error ? error.message : 'Unable to load this video.', 502); }
}
