import { adminResponse, adminSession, type AdminEnvironment } from '../../../../_lib/admin';
import { moveProductionCard } from '../../../../_lib/production-commands';

type Context = { request: Request; env: AdminEnvironment; params: { id: string } };

export async function onRequestPost({ request, env, params }: Context): Promise<Response> {
  const denied = await adminResponse(request, env); if (denied) return denied;
  const body = await request.json().catch(() => null) as { columnSourceId?: unknown; beforeCardId?: unknown } | null;
  try { return Response.json(await moveProductionCard(env, params.id, body || {}, (await adminSession(request, env))?.name || 'Admin')); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unable to move this card.' }, { status: 400 }); }
}
