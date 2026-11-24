import { apiData, apiError, requireApiScope } from '../../../../../_lib/internal-api';
import { linkCardVideo, VideoLinkError } from '../../../../../_lib/card-video-links';
import type { AdminEnvironment } from '../../../../../_lib/admin';
type Context = { request: Request; env: AdminEnvironment; params: { id: string } };
export async function onRequestPost({ request, env, params }: Context): Promise<Response> {
  const actor = await requireApiScope(request, env, 'associations:write'); if (actor instanceof Response) return actor;
  const body = await request.json().catch(() => null) as { assetId?: unknown; addComment?: unknown } | null;
  if (!body || typeof body.assetId !== 'string' || !/^[A-Za-z0-9]+$/.test(body.assetId) || (body.addComment !== undefined && typeof body.addComment !== 'boolean')) return apiError('invalid_video_id', 'Choose a valid Mux asset ID and boolean addComment.', 400);
  if (body.addComment) { const permission = await requireApiScope(request, env, 'cards:write'); if (permission instanceof Response) return permission; }
  try {
    const result = await linkCardVideo(env, params.id, body.assetId, actor, body.addComment === true);
    return apiData(result, undefined, result.created ? 201 : 200);
  } catch (error) { return apiError('video_link_failed', error instanceof VideoLinkError ? error.message : 'Unable to link the video.', error instanceof VideoLinkError ? error.status : 502); }
}
