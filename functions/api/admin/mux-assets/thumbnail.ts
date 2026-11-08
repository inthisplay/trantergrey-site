import { adminResponse, type AdminEnvironment } from '../../../_lib/admin';
import { getMuxLibraryAsset, muxThumbnailUrl } from '../../../_lib/mux';
import { patchMuxMetadata } from '../../../_lib/mux-state';

type Context = { request: Request; env: AdminEnvironment };
export async function onRequestPost({ request, env }: Context) {
  const denied = await adminResponse(request, env); if (denied) return denied;
  try {
    const body = await request.json() as { assetId?: unknown; time?: unknown };
    if (typeof body.assetId !== 'string') throw new Error('A valid Mux asset ID is required.');
    const time = Number(body.time); if (!Number.isFinite(time) || time < 0) throw new Error('Enter a valid thumbnail time.');
    const asset = await getMuxLibraryAsset(env, body.assetId);
    if (!asset.playbackId || asset.playbackPolicy !== 'public') throw new Error('Public playback must be enabled before choosing a thumbnail.');
    if (asset.duration > 0 && time > asset.duration) throw new Error('The thumbnail time must be within the video.');
    const saved = await patchMuxMetadata(env, body.assetId, { thumbnailTime: time });
    return Response.json({ ok: true, time: saved.thumbnailTime, thumbnailUrl: muxThumbnailUrl(asset.playbackId, saved.thumbnailTime ?? 1) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not save the thumbnail.' }, { status: 400 }); }
}
