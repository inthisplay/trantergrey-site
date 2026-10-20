import { adminResponse, type AdminEnvironment } from '../../_lib/admin';
import { getVimeoConnection, type VimeoEnvironment } from '../../_lib/vimeo-connection';
import { readVimeoLibrary } from '../../_lib/vimeo-state';

type Context = { request: Request; env: VimeoEnvironment & AdminEnvironment };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env);
  if (denied) return denied;
  const [connection, library] = await Promise.all([getVimeoConnection(env), readVimeoLibrary(env)]);
  return Response.json({ connected: Boolean(connection), videos: library?.videos.length || 0, importedAt: library?.importedAt || null });
}
