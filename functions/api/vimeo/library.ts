import { adminResponse, type AdminEnvironment } from '../../_lib/admin';
import { libraryOrNull } from '../../_lib/library-admin';

type Context = { request: Request; env: AdminEnvironment };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env);
  if (denied) return denied;
  const library = await libraryOrNull(env);
  return Response.json({ library });
}
