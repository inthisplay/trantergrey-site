import { adminSession, type AdminEnvironment } from '../_lib/admin';

type Context = { request: Request; env: AdminEnvironment; next: () => Promise<Response> };
const accessOwnerEmail = 'tyler@trantergrey.com';

export async function onRequest({ request, env, next }: Context): Promise<Response> {
  const session = await adminSession(request, env);
  if (!session) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', '/admin/access');
    return Response.redirect(login, 302);
  }
  if (session.email?.trim().toLowerCase() !== accessOwnerEmail) return Response.redirect(new URL('/admin', request.url), 302);
  return next();
}
