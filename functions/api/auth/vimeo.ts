import { adminResponse, origin } from '../../_lib/admin';
import type { VimeoEnvironment } from '../../_lib/vimeo-connection';

type Context = { request: Request; env: VimeoEnvironment };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env);
  if (denied) return denied;
  if (!env.VIMEO_CLIENT_ID || !env.VIMEO_REDIRECT_URI) return Response.json({ error: 'Vimeo OAuth is not configured yet.' }, { status: 503 });

  const state = crypto.randomUUID();
  const authorize = new URL('https://api.vimeo.com/oauth/authorize');
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', env.VIMEO_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', env.VIMEO_REDIRECT_URI);
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('scope', 'public private');
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      'Set-Cookie': `tg_vimeo_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}
