import { slateHtml } from '../../lib/production-comment-html';
import { getMuxLibraryAsset } from './mux';
import type { AdminEnvironment } from './admin';

// Resolve only exact first-party asset links. Never fetch a caller-supplied URL.
export async function videoCommentBody(env: AdminEnvironment, text: string, origin: string) {
  const ids = new Set<string>();
  for (const candidate of text.match(/https?:\/\/[^\s<>"']+/g) || []) {
    let url: URL;
    try { url = new URL(candidate.replace(/[.,;!?)]+$/, '')); } catch { continue; }
    if (url.origin !== new URL(origin).origin || url.username || url.password) continue;
    const match = url.pathname.match(/^\/watch\/(?:u\/)?([A-Za-z0-9]{6,})\/?$/);
    if (match) ids.add(match[1]);
  }
  if (ids.size > 5) throw new Error('Add at most five video links per comment.');
  const blocks: unknown[] = [{ type: 'paragraph', children: [{ text }] }];
  for (const id of ids) {
    const asset = await getMuxLibraryAsset(env, id);
    if (!asset.playerUrl || asset.playbackPolicy !== 'public') throw new Error('This video has no public playable version. Playback visibility was not changed.');
    blocks.push({ type: 'mux-asset', assetId: asset.id, itemKind: 'video', title: asset.title, duration: asset.duration, thumbnailUrl: asset.thumbnailUrl,
      media: [{ id: asset.id, title: asset.title, playerUrl: asset.playerUrl, thumbnailUrl: asset.thumbnailUrl }], children: [{ text: '' }] });
  }
  return ids.size ? { bodyHtml: slateHtml(blocks), bodyJson: JSON.stringify(blocks) } : null;
}
