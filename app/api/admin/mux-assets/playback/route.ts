import { requireAdminApi } from '@/lib/admin-auth';
import { createMuxPublicPlaybackId, deleteMuxPlaybackId } from '@/lib/mux-api';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  try {
    const body = await request.json() as { assetId?: unknown; action?: unknown; playbackId?: unknown };
    if (typeof body.assetId !== 'string' || !/^[A-Za-z0-9]+$/.test(body.assetId)) throw new Error('A valid Mux asset ID is required.');
    const credentials = { tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET };
    if (body.action === 'enable-public') {
      await createMuxPublicPlaybackId(body.assetId, credentials);
    } else if (body.action === 'disable-public') {
      if (typeof body.playbackId !== 'string' || !/^[A-Za-z0-9]+$/.test(body.playbackId)) throw new Error('A valid playback ID is required.');
      await deleteMuxPlaybackId(body.assetId, body.playbackId, credentials);
    } else {
      throw new Error('Choose a valid playback action.');
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not update playback.' }, { status: 400 });
  }
}
