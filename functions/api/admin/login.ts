import { adminCookie, configured, origin, safeDestination, sameValue, type AdminEnvironment } from '../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment };

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  const form = await request.formData();
  const destination = safeDestination(form.get('next'));
  const password = typeof form.get('password') === 'string' ? String(form.get('password')) : '';
  const location = new URL('/login', origin(request));
  location.searchParams.set('next', destination);

  if (!configured(env)) {
    location.searchParams.set('error', 'config');
    return Response.redirect(location, 303);
  }
  if (!sameValue(password, env.ADMIN_PASSWORD || '')) {
    location.searchParams.set('error', '1');
    return Response.redirect(location, 303);
  }

  const response = Response.redirect(new URL(destination, origin(request)), 303);
  response.headers.append('Set-Cookie', await adminCookie(env));
  return response;
}
