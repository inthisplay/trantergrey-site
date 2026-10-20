import { adminResponse, type AdminEnvironment } from '../../../_lib/admin';
import { cleanTags, updateLibraryVideo } from '../../../_lib/library-admin';

type Context = { request: Request; env: AdminEnvironment };

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { id?: unknown; tags?: unknown } | null;
  const tags = cleanTags(body?.tags);
  if (!body || typeof body.id !== 'string' || !tags) return Response.json({ error: 'Use up to 24 tags, each under 48 characters.' }, { status: 400 });
  const video = await updateLibraryVideo(env, body.id, (item) => ({ ...item, localTags: tags }));
  return video ? Response.json({ id: video.id, localTags: tags }) : Response.json({ error: 'Video not found.' }, { status: 404 });
}
