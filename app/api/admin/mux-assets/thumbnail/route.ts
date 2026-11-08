import { requireAdminApi } from '@/lib/admin-auth';
import { getMuxLibraryAsset, muxThumbnailUrl } from '@/lib/mux-api';
import { setMuxAssetThumbnailTime } from '@/lib/mux-library-metadata';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  try {
    const body = await request.json() as { assetId?: unknown; time?: unknown };
    if (typeof body.assetId !== 'string' || !/^[A-Za-z0-9]+$/.test(body.assetId)) throw new Error('A valid Mux asset ID is required.');
    const time = typeof body.time === 'number' ? body.time : Number(body.time);
    if (!Number.isFinite(time) || time < 0) throw new Error('Enter a valid thumbnail time.');
    const asset = await getMuxLibraryAsset(body.assetId, { tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET });
    if (!asset.playbackId || asset.playbackPolicy !== 'public') throw new Error('Public playback must be enabled before choosing a thumbnail.');
    if (asset.duration > 0 && time > asset.duration) throw new Error('The thumbnail time must be within the video.');
    const saved = await setMuxAssetThumbnailTime(body.assetId, time);
    return Response.json({ ok: true, time: saved.time, thumbnailUrl: muxThumbnailUrl(asset.playbackId, saved.time) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not save the thumbnail.' }, { status: 400 });
  }
}
