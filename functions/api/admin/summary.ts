import { adminResponse, type AdminEnvironment } from '../../_lib/admin';
import { getMuxLibraryAssets } from '../../_lib/mux';

type Context = { request: Request; env: AdminEnvironment };
type Count = { count: number };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env);
  if (denied) return denied;

  const [contacts, assets] = await Promise.allSettled([
    env.TG_DATA.prepare('SELECT COUNT(*) AS count FROM contact_inquiries').first<Count>(),
    getMuxLibraryAssets(env),
  ]);
  for (const [index, result] of [contacts, assets].entries()) {
    if (result.status === 'rejected') console.error('Admin summary dependency failed', index === 0 ? 'contacts' : 'mux', result.reason instanceof Error ? result.reason.message : 'Unknown error');
  }
  return Response.json({
    contacts: contacts.status === 'fulfilled' ? contacts.value?.count || 0 : null,
    videos: assets.status === 'fulfilled' ? assets.value.length : null,
    warning: contacts.status === 'rejected' || assets.status === 'rejected' ? 'Some summary counts are temporarily unavailable. You can still open the tools below.' : undefined,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
