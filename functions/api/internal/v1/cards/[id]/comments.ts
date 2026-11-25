import { CardInputError } from '../../../../../_lib/create-production-card';
import { videoCommentBody } from '../../../../../_lib/video-comment-body';
import { readCardComments, CommentReadError } from '../../../../../_lib/card-comments';
import { apiData, apiError, requireApiScope } from '../../../../../_lib/internal-api';
import { addProductionComment, escapeHtml } from '../../../../../_lib/production-commands';
import type { AdminEnvironment } from '../../../../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment; params: { id: string } };

export async function onRequestPost({ request, env, params }: Context): Promise<Response> {
  const actor = await requireApiScope(request, env, 'cards:write'); if (actor instanceof Response) return actor;
  const body = await request.json().catch(() => null) as { body?: unknown; requestId?: unknown } | null;
  if (!body || typeof body.body !== 'string' || !body.body.trim()) return apiError('invalid_comment', 'Enter a comment.', 400);
  const text = body.body.trim();
  if (text.length > 10_000) return apiError('invalid_comment', 'Enter a comment under 10,000 characters.', 400);
  try { const rich = await videoCommentBody(env, text, new URL(request.url).origin); return apiData(await addProductionComment(env, params.id, { requestId: body.requestId, ...(rich || { bodyHtml: `<p>${escapeHtml(text).replace(/\r?\n/g, '<br>')}</p>`, bodyJson: JSON.stringify({ text }) }) }, actor), undefined, 201); }
  catch (error) { if (error instanceof CardInputError) return apiError('comment_create_failed', error.message, error.status); return apiError('comment_create_failed', 'Unable to add this comment. Check that any TG video links identify publicly playable assets; use link_video_to_card for a resolved asset.', 400); }
}

export async function onRequestGet({ request, env, params }: Context): Promise<Response> {
  const actor = await requireApiScope(request, env, 'cards:read'); if (actor instanceof Response) return actor;
  const url = new URL(request.url);
  try {
    const result = await readCardComments(env, params.id, url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 20, url.searchParams.get('cursor') || '');
    return apiData(result.comments, { nextCursor: result.nextCursor, coverage: result.coverage });
  } catch (error) {
    if (error instanceof CommentReadError) return apiError('invalid_comment_read', error.message, error.status);
    return apiError('comments_unavailable', 'Unable to read comments. Try again later.', 503);
  }
}
