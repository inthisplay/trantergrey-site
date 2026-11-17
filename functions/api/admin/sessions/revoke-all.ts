import { adminSession, type AdminEnvironment } from '../../../_lib/admin';

const accessOwnerEmail = 'tyler@trantergrey.com';

export async function onRequestPost({ request, env }: { request: Request; env: AdminEnvironment }): Promise<Response> {
  const session = await adminSession(request, env);
  if (!session) return Response.json({ error: 'Sign in to manage website sessions.' }, { status: 401 });
  if (session.email?.trim().toLowerCase() !== accessOwnerEmail) return Response.json({ error: 'This action is restricted to its owner.' }, { status: 403 });
  await env.TG_DATA.prepare('DELETE FROM admin_sessions').run();
  return Response.json({ ok: true, signedOut: 'all' }, { headers: { 'Cache-Control': 'no-store' } });
}
