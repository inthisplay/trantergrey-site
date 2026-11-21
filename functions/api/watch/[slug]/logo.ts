import type { AdminEnvironment } from '../../../_lib/admin';
import { publicWatchData } from '../../../_lib/mux-public';
import { clientPublicLogo } from '../../../_lib/client-public-logo';

export async function onRequestGet({ env, params }: { env: AdminEnvironment; params: { slug: string } }) {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' };
  const video = await publicWatchData(env, params.slug);
  const key = video?.unbrandedPublicPage ? await clientPublicLogo(env, { client: video.client, unbrandedPublicPage: true }) : null;
  const object = key ? await env.PRODUCTION_ARCHIVE?.get(key) : null;
  if (!object) return new Response(null, { status: 404, headers });
  return new Response(object.body, { headers: { ...headers, 'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream' } });
}
