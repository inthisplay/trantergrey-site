import { adminResponse, type AdminEnvironment } from '../../_lib/admin';
import { readVimeoLibrary } from '../../_lib/vimeo-state';

type Context = { request: Request; env: AdminEnvironment };
type Count = { count: number };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env);
  if (denied) return denied;

  const [contacts, collections, library] = await Promise.all([
    env.TG_DATA.prepare('SELECT COUNT(*) AS count FROM contact_inquiries').first<Count>(),
    env.TG_DATA.prepare('SELECT COUNT(*) AS count FROM work_collections').first<Count>(),
    readVimeoLibrary(env),
  ]);
  const videos = Array.isArray(library?.videos) ? library.videos.length : 0;
  return Response.json({ contacts: contacts?.count || 0, collections: collections?.count || 0, videos });
}
