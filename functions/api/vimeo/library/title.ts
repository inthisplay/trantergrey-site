import { adminResponse, type AdminEnvironment } from '../../../_lib/admin';
import { updateLibraryVideo } from '../../../_lib/library-admin';

type Context = { request: Request; env: AdminEnvironment };

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { id?: unknown; title?: unknown } | null;
  if (!body || typeof body.id !== 'string' || typeof body.title !== 'string') return Response.json({ error: 'Keep titles under 140 characters.' }, { status: 400 });
  const title = body.title.trim();
  if (title.length > 140) return Response.json({ error: 'Keep titles under 140 characters.' }, { status: 400 });
  const video = await updateLibraryVideo(env, body.id, (item) => ({ ...item, customTitle: title || null }));
  return video ? Response.json({ id: video.id, customTitle: video.customTitle ?? null }) : Response.json({ error: 'Video not found.' }, { status: 404 });
}
