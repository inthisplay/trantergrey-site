import { adminResponse, type AdminEnvironment } from '../../_lib/admin';
import { clientHQResponse } from '../../_lib/client-hq';

export async function onRequest(context: { request: Request; env: AdminEnvironment }) {
  const denied = await adminResponse(context.request, context.env);
  return denied || clientHQResponse(context);
}
