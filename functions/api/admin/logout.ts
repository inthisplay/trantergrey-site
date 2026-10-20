import { clearAdminCookie } from '../../_lib/admin';

export async function onRequestPost({ request }: { request: Request }): Promise<Response> {
  const response = Response.redirect(new URL('/login', request.url), 303);
  response.headers.append('Set-Cookie', clearAdminCookie());
  return response;
}
