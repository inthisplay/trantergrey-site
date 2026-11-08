import { hasAdminSession, type AdminEnvironment } from '../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  if (!await hasAdminSession(request, env)) return Response.json({ authenticated: false }, { status: 401 });
  return Response.json({ authenticated: true }, { headers: { 'Cache-Control': 'private, no-store' } });
}
