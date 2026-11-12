import { adminSession, type AdminEnvironment } from '../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const session = await adminSession(request, env);
  if (!session) return Response.json({ authenticated: false }, { status: 401 });
  return Response.json({ authenticated: true, user: session }, { headers: { 'Cache-Control': 'private, no-store' } });
}
