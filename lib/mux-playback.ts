import type { MuxLibraryAsset } from './mux-shared';

export type MuxPlaybackMap = Record<string, string>;

const explicitMuxAssetByVimeoId: Record<string, string> = {
  // Taylor BMW - Center Of Excellence 2021
  '654278945': '8A029oWR01MXttjFbExkobOa2cvLmpKCPOAtZM7bAW4X00',
};

export function getAutoApprovedMuxPlaybackMap(assets: MuxLibraryAsset[]): MuxPlaybackMap {
  const playbackByVimeoId: MuxPlaybackMap = {};

  for (const asset of assets) {
    if (asset.status !== 'ready' || asset.playbackPolicy !== 'public' || !asset.vimeoId || !asset.playbackId) continue;
    if (!playbackByVimeoId[asset.vimeoId]) playbackByVimeoId[asset.vimeoId] = asset.playbackId;
  }

  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  for (const [vimeoId, muxAssetId] of Object.entries(explicitMuxAssetByVimeoId)) {
    const asset = assetsById.get(muxAssetId);
    if (asset?.status === 'ready' && asset.playbackPolicy === 'public' && asset.playbackId) {
      playbackByVimeoId[vimeoId] = asset.playbackId;
    }
  }

  return playbackByVimeoId;
}
