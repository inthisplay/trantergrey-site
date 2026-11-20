import type { AdminEnvironment } from '../../../_lib/admin';
import { readVideoProjectStore } from '../../../_lib/mux-state';
import { clientPublicLogo } from '../../../_lib/client-public-logo';

export async function onRequestGet({ env, params }: { env: AdminEnvironment; params: { slug: string } }) {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' };
  const store = await readVideoProjectStore(env);
  const project = store.projects.find(item => item.slug === params.slug || item.legacySlugs?.includes(params.slug));
  const key = project ? await clientPublicLogo(env, project) : null;
  const object = key ? await env.PRODUCTION_ARCHIVE?.get(key) : null;
  if (!object) return new Response(null, { status: 404, headers });
  return new Response(object.body, { headers: { ...headers, 'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream' } });
}
