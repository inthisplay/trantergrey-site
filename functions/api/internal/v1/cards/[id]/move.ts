import { apiData, apiError, requireApiScope } from '../../../../../_lib/internal-api';
import { moveProductionCard } from '../../../../../_lib/production-commands';
import type { AdminEnvironment } from '../../../../../_lib/admin';

type Context = { request: Request; env: AdminEnvironment; params: { id: string } };

export async function onRequestPost({ request, env, params }: Context): Promise<Response> {
  const actor = await requireApiScope(request, env, 'cards:write'); if (actor instanceof Response) return actor;
  const body = await request.json().catch(() => null) as { columnSourceId?: unknown; beforeCardId?: unknown } | null;
  try { return apiData(await moveProductionCard(env, params.id, body || {}, actor.name)); }
  catch (error) { return apiError('card_move_failed', error instanceof Error ? error.message : 'Unable to move this card.', 400); }
}
