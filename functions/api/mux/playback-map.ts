import { getAutoApprovedMuxPlaybackMap } from '../../../lib/mux-playback';
import type { AdminEnvironment } from '../../_lib/admin';
import { getMuxLibraryAssets } from '../../_lib/mux';
import { readMuxPlaybackMap, writeMuxPlaybackMap } from '../../_lib/mux-playback';

type Context = { env: AdminEnvironment };

const refreshAfterMilliseconds = 6 * 60 * 60 * 1000;

export async function onRequestGet({ env }: Context): Promise<Response> {
  const stored = await readMuxPlaybackMap(env);
  const storedAt = stored ? Date.parse(stored.updatedAt) : Number.NaN;
  const fresh = stored && Number.isFinite(storedAt) && Date.now() - storedAt < refreshAfterMilliseconds;

  if (fresh) {
    return Response.json(stored, { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' } });
  }

  try {
    const assets = await getMuxLibraryAssets(env);
    const current = await writeMuxPlaybackMap(env, getAutoApprovedMuxPlaybackMap(assets));
    return Response.json(current, { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' } });
  } catch {
    if (stored) return Response.json(stored, { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600' } });
    return Response.json({ playbackByVimeoId: {} }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
