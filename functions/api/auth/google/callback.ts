import { adminCookie, isTranterGreyEmail, origin, sameValue, type AdminEnvironment } from '../../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment };
const stateCookie = 'tg_google_oauth_state';

function cookie(request: Request, name: string) {
  const value = request.headers.get('cookie') || '';
  return value.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function redirectUri(request: Request, env: AdminEnvironment) {
  return env.GOOGLE_REDIRECT_URI || new URL('/api/auth/google/callback', origin(request)).toString();
}

function loginError(request: Request, error: string) {
  return Response.redirect(new URL(`/login?error=${error}`, origin(request)), 303);
}

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = cookie(request, stateCookie);
  if (!code || !state || !expectedState || !sameValue(state, expectedState)) return loginError(request, 'google');
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return loginError(request, 'google-config');
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri(request, env), grant_type: 'authorization_code' }) });
  if (!tokenResponse.ok) return loginError(request, 'google');
  const tokens = await tokenResponse.json() as { access_token?: unknown };
  if (typeof tokens.access_token !== 'string') return loginError(request, 'google');
  const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  if (!profileResponse.ok) return loginError(request, 'google');
  const profile = await profileResponse.json() as { email?: unknown; email_verified?: unknown; hd?: unknown; name?: unknown };
  if (typeof profile.email !== 'string' || profile.email_verified !== true || profile.hd !== 'trantergrey.com' || !isTranterGreyEmail(profile.email)) return loginError(request, 'domain');
  const displayName = typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : profile.email.split('@')[0];
  const headers = new Headers({ Location: new URL('/admin', origin(request)).toString() });
  headers.append('Set-Cookie', `${stateCookie}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  headers.append('Set-Cookie', await adminCookie(env, { name: displayName, email: profile.email }));
  return new Response(null, { status: 303, headers });
}
