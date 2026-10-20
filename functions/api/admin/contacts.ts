import { adminResponse, type AdminEnvironment } from '../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment };
type Inquiry = { id: string; receivedAt: string; name: string; email: string; business: string; focus: string; timeline: string; message: string };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const denied = await adminResponse(request, env);
  if (denied) return denied;
  const rows = await env.TG_DATA.prepare('SELECT id, received_at AS receivedAt, name, email, business, focus, timeline, message FROM contact_inquiries ORDER BY received_at DESC').all<Inquiry>();
  return Response.json({ inquiries: rows.results });
}
