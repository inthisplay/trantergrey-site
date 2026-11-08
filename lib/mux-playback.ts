import type { MuxLibraryAsset } from './mux-shared';

export type MuxPlaybackMap = Record<string, string>;

export function getAutoApprovedMuxPlaybackMap(assets: MuxLibraryAsset[]): MuxPlaybackMap {
  const playbackByVimeoId: MuxPlaybackMap = {};

  for (const asset of assets) {
    if (asset.status !== 'ready' || asset.playbackPolicy !== 'public' || !asset.vimeoId || !asset.playbackId) continue;
    if (!playbackByVimeoId[asset.vimeoId]) playbackByVimeoId[asset.vimeoId] = asset.playbackId;
  }

  return playbackByVimeoId;
}
