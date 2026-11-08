import { adminResponse, type AdminEnvironment } from '../../../_lib/admin';
import { createMuxPublicPlaybackId, deleteMuxPlaybackId } from '../../../_lib/mux';

type Context = { request: Request; env: AdminEnvironment };
export async function onRequestPost({ request, env }: Context) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try {
    const body = await request.json() as { assetId?: unknown; action?: unknown; playbackId?: unknown };
    if (typeof body.assetId !== 'string') throw new Error('A valid Mux asset ID is required.');
    if (body.action === 'enable-public') await createMuxPublicPlaybackId(env, body.assetId);
    else if (body.action === 'disable-public' && typeof body.playbackId === 'string') await deleteMuxPlaybackId(env, body.assetId, body.playbackId);
    else throw new Error('Choose a valid playback action.');
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not update playback.' }, { status: 400 }); }
}
