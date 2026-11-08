import { requireAdminApi } from '@/lib/admin-auth';
import { getMuxLibraryAssets, muxThumbnailUrl } from '@/lib/mux-api';
import { matchMuxAssetsToVimeo } from '@/lib/mux-matching';
import { getVimeoLibrary } from '@/lib/vimeo-library';
import { getVideoProjectStore } from '@/lib/video-projects';
import { getMuxLibraryMetadata } from '@/lib/mux-library-metadata';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;
  try {
    const [muxAssets, library, projectStore, metadata] = await Promise.all([
      getMuxLibraryAssets({ tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET }),
      getVimeoLibrary(),
      getVideoProjectStore(),
      getMuxLibraryMetadata(),
    ]);
    const candidates = (library?.videos ?? []).map((video) => ({
      id: video.id,
      title: video.title,
      customTitle: video.customTitle,
      client: video.client,
      duration: video.duration,
    }));
    const vimeoById = new Map((library?.videos ?? []).map((video) => [video.id, video]));
    const matched = matchMuxAssetsToVimeo(muxAssets, candidates).map((asset) => {
      const thumbnailTime = metadata.thumbnailTimesByAssetId[asset.id];
      const vimeoSource = asset.vimeoMatch ? vimeoById.get(asset.vimeoMatch.id) : undefined;
      const vimeoDisplayTitle = vimeoSource?.customTitle?.trim() || vimeoSource?.title?.trim();
      const hasTagOverride = Object.prototype.hasOwnProperty.call(metadata.tagsByAssetId, asset.id);
      return {
        ...asset,
        title: metadata.titlesByAssetId[asset.id]?.trim() || vimeoDisplayTitle || asset.title,
        client: metadata.clientsByAssetId[asset.id] || asset.client,
        localTags: hasTagOverride ? metadata.tagsByAssetId[asset.id] : (vimeoSource?.localTags ?? []),
        libraryStatus: metadata.statusesByAssetId[asset.id] ?? vimeoSource?.libraryStatus ?? 'unreviewed',
        thumbnailUrl: asset.playbackId && thumbnailTime !== undefined ? muxThumbnailUrl(asset.playbackId, thumbnailTime) : asset.thumbnailUrl,
        thumbnailTime: thumbnailTime ?? 1,
      };
    });
    return Response.json({ assets: matched, ...projectStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read the Mux library.';
    return Response.json({ error: message }, { status: 502 });
  }
}
