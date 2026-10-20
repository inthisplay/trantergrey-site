import { adminResponse, type AdminEnvironment } from '../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment };
type Count = { count: number };
type LibraryState = { value: string };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env);
  if (denied) return denied;

  const [contacts, collections, library] = await Promise.all([
    env.TG_DATA.prepare('SELECT COUNT(*) AS count FROM contact_inquiries').first<Count>(),
    env.TG_DATA.prepare('SELECT COUNT(*) AS count FROM work_collections').first<Count>(),
    env.TG_DATA.prepare("SELECT value FROM vimeo_state WHERE key = 'library'").first<LibraryState>(),
  ]);
  let videos = 0;
  try { videos = (JSON.parse(library?.value || '{"videos":[]}').videos || []).length; } catch { /* leave as zero */ }
  return Response.json({ contacts: contacts?.count || 0, collections: collections?.count || 0, videos });
}
