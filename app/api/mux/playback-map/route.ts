import { getMuxLibraryAssets } from '@/functions/_lib/mux';
import type { AdminEnvironment } from '@/functions/_lib/admin';
import { getAutoApprovedMuxPlaybackMap } from '@/lib/mux-playback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let cached: { expiresAt: number; playbackByVimeoId: Record<string, string> } | null = null;

export async function GET() {
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json({ playbackByVimeoId: cached.playbackByVimeoId }, { headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const environment = {
      MUX_TOKEN_ID: process.env.MUX_TOKEN_ID,
      MUX_TOKEN_SECRET: process.env.MUX_TOKEN_SECRET,
    } as AdminEnvironment;
    const playbackByVimeoId = getAutoApprovedMuxPlaybackMap(await getMuxLibraryAssets(environment));
    cached = { expiresAt: Date.now() + 10 * 60 * 1000, playbackByVimeoId };
    return Response.json({ playbackByVimeoId }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ playbackByVimeoId: {} }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
