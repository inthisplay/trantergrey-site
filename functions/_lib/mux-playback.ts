import type { MuxPlaybackMap } from '../../lib/mux-playback';
import type { AdminEnvironment } from './admin';

type StoredPlaybackMap = { value: string; updatedAt: string };

export async function readMuxPlaybackMap(env: AdminEnvironment) {
  const stored = await env.TG_DATA
    .prepare("SELECT value, updated_at AS updatedAt FROM vimeo_state WHERE key = 'mux_playback_map'")
    .first<StoredPlaybackMap>();
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored.value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const playbackByVimeoId = Object.fromEntries(Object.entries(parsed).filter(([vimeoId, playbackId]) => /^\d{5,20}$/.test(vimeoId) && typeof playbackId === 'string' && /^[A-Za-z0-9]+$/.test(playbackId)));
    return { playbackByVimeoId, updatedAt: stored.updatedAt };
  } catch {
    return null;
  }
}

export async function writeMuxPlaybackMap(env: AdminEnvironment, playbackByVimeoId: MuxPlaybackMap) {
  const updatedAt = new Date().toISOString();
  await env.TG_DATA
    .prepare("INSERT INTO vimeo_state (key, value, updated_at) VALUES ('mux_playback_map', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(JSON.stringify(playbackByVimeoId), updatedAt)
    .run();
  return { playbackByVimeoId, updatedAt };
}
