import { adminResponse, type AdminEnvironment } from '../../../_lib/admin';
import { updateLibraryVideo } from '../../../_lib/library-admin';

type Context = { request: Request; env: AdminEnvironment };
const statuses = new Set(['unreviewed', 'published', 'hidden']);

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { id?: unknown; status?: unknown } | null;
  if (!body || typeof body.id !== 'string' || typeof body.status !== 'string' || !statuses.has(body.status)) return Response.json({ error: 'Invalid library update.' }, { status: 400 });
  const video = await updateLibraryVideo(env, body.id, (item) => ({ ...item, libraryStatus: body.status as 'unreviewed' | 'published' | 'hidden' }));
  return video ? Response.json({ id: video.id, status: video.libraryStatus }) : Response.json({ error: 'Video not found.' }, { status: 404 });
}
