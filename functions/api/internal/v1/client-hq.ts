import type { AdminEnvironment } from '../../../_lib/admin';
import { clientHQResponse } from '../../../_lib/client-hq';
import { apiData, apiError, requireApiScope } from '../../../_lib/internal-api';

export async function onRequest(context: { request: Request; env: AdminEnvironment }) {
  const { request, env } = context;
  const actor = await requireApiScope(request, env, request.method === 'GET' ? 'clients:read' : 'clients:write');
  if (actor instanceof Response) return actor;
  if (!['GET', 'POST'].includes(request.method)) return apiError('method_not_allowed', 'Use GET or POST.', 405);
  try {
    const response = await clientHQResponse(context, actor.name);
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) return apiError('client_hq_failed', payload?.error || 'Unable to update Client HQ.', response.status);
    return apiData(payload, undefined, response.status);
  } catch {
    return apiError('client_hq_unavailable', 'Client HQ is temporarily unavailable. Please try again.', 503);
  }
}
