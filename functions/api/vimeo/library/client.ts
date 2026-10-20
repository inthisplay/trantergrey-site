import { adminResponse, type AdminEnvironment } from '../../../_lib/admin';
import { updateLibrary, updateLibraryVideo } from '../../../_lib/library-admin';

type Context = { request: Request; env: AdminEnvironment };

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { id?: unknown; client?: unknown } | null;
  if (!body || typeof body.id !== 'string' || typeof body.client !== 'string' || body.client.trim().length > 80) return Response.json({ error: 'Keep client names under 80 characters.' }, { status: 400 });
  const client = body.client.trim();
  const video = await updateLibraryVideo(env, body.id, (item) => ({ ...item, client: client || null }));
  if (!video) return Response.json({ error: 'Video not found.' }, { status: 404 });
  if (client) await updateLibrary(env, (library) => ({ ...library, clients: [...new Set([...(library.clients ?? []), client])].sort((a, b) => a.localeCompare(b)) }));
  return Response.json({ id: video.id, client: video.client ?? null });
}
