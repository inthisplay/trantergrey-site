import { adminSession, type AdminEnvironment } from './admin';
export async function requireAccessOwner(request: Request, env: AdminEnvironment) {
  const session = await adminSession(request, env);
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!session) return Response.json({ error: 'Sign in to manage access.' }, { status: 401, headers });
  if (session.email?.trim().toLowerCase() !== 'tyler@trantergrey.com') return Response.json({ error: 'This page is restricted to its owner.' }, { status: 403, headers });
  if (request.method !== 'GET' && request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Use the admin access page to make changes.' }, { status: 403, headers });
  return null;
}
