import { apiData, apiError, requireApiScope } from '../../../../../_lib/internal-api';
import { addProductionComment, escapeHtml } from '../../../../../_lib/production-commands';
import type { AdminEnvironment } from '../../../../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment; params: { id: string } };

export async function onRequestPost({ request, env, params }: Context): Promise<Response> {
  const actor = await requireApiScope(request, env, 'cards:write'); if (actor instanceof Response) return actor;
  const body = await request.json().catch(() => null) as { body?: unknown } | null;
  if (!body || typeof body.body !== 'string' || !body.body.trim()) return apiError('invalid_comment', 'Enter a comment.', 400);
  const text = body.body.trim();
  if (text.length > 10_000) return apiError('invalid_comment', 'Enter a comment under 10,000 characters.', 400);
  try { return apiData(await addProductionComment(env, params.id, { bodyHtml: `<p>${escapeHtml(text).replace(/\r?\n/g, '<br>')}</p>`, bodyJson: JSON.stringify({ text }) }, actor), undefined, 201); }
  catch (error) { return apiError('comment_create_failed', error instanceof Error ? error.message : 'Unable to add this comment.', 400); }
}
