import { origin, safeDestination, type AdminEnvironment } from '../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment };
const stateCookie = 'tg_google_oauth_state';
const destinationCookie = 'tg_google_oauth_next';
const stateLifetime = 60 * 10;

function redirectUri(request: Request, env: AdminEnvironment) {
  return env.GOOGLE_REDIRECT_URI || new URL('/api/auth/google/callback', origin(request)).toString();
}

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return Response.redirect(new URL('/login?error=google-config', origin(request)), 303);
  const destination = safeDestination(new URL(request.url).searchParams.get('next'));
  const state = crypto.randomUUID();
  const authorizeUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorizeUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri(request, env));
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', 'openid email profile');
  authorizeUrl.searchParams.set('hd', 'trantergrey.com');
  authorizeUrl.searchParams.set('state', state);
  const headers = new Headers({ Location: authorizeUrl.toString() });
  headers.append('Set-Cookie', `${stateCookie}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${stateLifetime}`);
  headers.append('Set-Cookie', `${destinationCookie}=${encodeURIComponent(destination)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${stateLifetime}`);
  return new Response(null, { status: 303, headers });
}
