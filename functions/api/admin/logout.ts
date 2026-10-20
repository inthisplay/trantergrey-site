import { clearAdminCookie } from '../../_lib/admin';

export async function onRequestPost({ request }: { request: Request }): Promise<Response> {
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL('/login', request.url).toString(),
      'Set-Cookie': clearAdminCookie(),
    },
  });
}
