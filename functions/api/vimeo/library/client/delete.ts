import { adminResponse, type AdminEnvironment } from '../../../../_lib/admin';
import { updateLibrary } from '../../../../_lib/library-admin';

type Context = { request: Request; env: AdminEnvironment };

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { client?: unknown } | null;
  if (!body || typeof body.client !== 'string' || !body.client.trim()) return Response.json({ error: 'Invalid client.' }, { status: 400 });
  const client = body.client.trim();
  const library = await updateLibrary(env, (current) => ({
    ...current,
    clients: (current.clients ?? []).filter((item) => item !== client),
    videos: current.videos.map((video) => video.client === client ? { ...video, client: null } : video),
  }));
  return library ? Response.json({ client }) : Response.json({ error: 'Library not found.' }, { status: 404 });
}
