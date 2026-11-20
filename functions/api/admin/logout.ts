import { clearAdminCookie, revokeAdminSession, type AdminEnvironment } from '../../_lib/admin';

export async function onRequestPost({ request, env }: { request: Request; env: AdminEnvironment }): Promise<Response> {
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: 'Invalid request origin.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  // Revoke before reporting success; a failed deletion must not look like logout.
  await revokeAdminSession(request, env);
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL('/login', request.url).toString(),
      'Set-Cookie': clearAdminCookie(),
      'Cache-Control': 'private, no-store',
    },
  });
}
