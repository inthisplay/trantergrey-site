import { adminResponse, type AdminEnvironment } from '../../_lib/admin';
import { getMuxLibraryAssets } from '../../_lib/mux';

type Context = { request: Request; env: AdminEnvironment };
type Count = { count: number };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env);
  if (denied) return denied;

  const [contacts, collections, assets] = await Promise.all([
    env.TG_DATA.prepare('SELECT COUNT(*) AS count FROM contact_inquiries').first<Count>(),
    env.TG_DATA.prepare('SELECT COUNT(*) AS count FROM work_collections').first<Count>(),
    getMuxLibraryAssets(env),
  ]);
  return Response.json({ contacts: contacts?.count || 0, collections: collections?.count || 0, videos: assets.length });
}
