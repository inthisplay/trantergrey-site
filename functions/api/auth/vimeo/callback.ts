import { adminResponse } from '../../../_lib/admin';
import { saveVimeoConnection, type VimeoEnvironment } from '../../../_lib/vimeo-connection';

type Context = { request: Request; env: VimeoEnvironment };

function cookie(request: Request, name: string) {
  const value = request.headers.get('cookie') || '';
  return value.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env);
  if (denied) return denied;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const clearState = 'tg_vimeo_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
  if (!code || !state || state !== cookie(request, 'tg_vimeo_state')) {
    return new Response(null, {
      status: 303,
      headers: {
        Location: new URL('/connect-vimeo?error=verify', request.url).toString(),
        'Set-Cookie': clearState,
      },
    });
  }
  if (!env.VIMEO_CLIENT_ID || !env.VIMEO_CLIENT_SECRET || !env.VIMEO_REDIRECT_URI || !env.VIMEO_TOKEN_KEY) return Response.json({ error: 'Vimeo OAuth is not configured yet.' }, { status: 503 });

  const credentials = btoa(`${env.VIMEO_CLIENT_ID}:${env.VIMEO_CLIENT_SECRET}`);
  const tokenResponse = await fetch('https://api.vimeo.com/oauth/access_token', {
    method: 'POST',
    headers: { Authorization: `basic ${credentials}`, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: env.VIMEO_REDIRECT_URI }),
  });
  if (!tokenResponse.ok) return Response.json({ error: 'Vimeo rejected the authorization request.' }, { status: 502 });
  const token = await tokenResponse.json() as { access_token?: string; scope?: string };
  if (!token.access_token) return Response.json({ error: 'Vimeo did not return an access token.' }, { status: 502 });
  await saveVimeoConnection(env, { accessToken: token.access_token, scope: token.scope, connectedAt: new Date().toISOString() });
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL('/connect-vimeo?connected=1', request.url).toString(),
      'Set-Cookie': clearState,
    },
  });
}
