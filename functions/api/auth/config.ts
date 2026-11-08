import { passwordConfigured, type AdminEnvironment } from '../../_lib/admin';

type Context = { env: AdminEnvironment };

export async function onRequestGet({ env }: Context): Promise<Response> {
  return Response.json({
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    password: passwordConfigured(env),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
