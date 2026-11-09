import { matchMuxAssetsToVimeo, type MatchedMuxLibraryAsset, type VimeoMatchCandidate } from '../../lib/mux-matching';
import type { AdminEnvironment } from './admin';
import { getMuxLibraryAssets, muxThumbnailUrl } from './mux';
import { assignShortVideoUrls, readMuxMetadata, readVideoProjectStore } from './mux-state';
import publishedLibrarySeed from '../../lib/published-vimeo-library.json';

type VimeoRecord = VimeoMatchCandidate & {
  createdAt?: string | null;
  folderPath?: string | null;
  localTags?: string[];
  libraryStatus?: 'unreviewed' | 'published' | 'hidden';
};

export async function readEnrichedMuxLibrary(env: AdminEnvironment) {
  const [muxAssets, metadata, initialStore] = await Promise.all([
    getMuxLibraryAssets(env),
    readMuxMetadata(env),
    readVideoProjectStore(env),
  ]);
  const migration = await assignShortVideoUrls(env, muxAssets);
  const store = migration.updated ? await readVideoProjectStore(env) : initialStore;
  // Keep the bundled historic archive only to preserve legacy dates and client
  // names while Mux metadata is being completed. No runtime Vimeo state or API
  // is consulted by the Mux catalog.
  const publishedVideos = publishedLibrarySeed.videos as VimeoRecord[];
  const videos = publishedVideos.flatMap((raw) => {
    const video = raw as VimeoRecord;
    return typeof video.id === 'string' && typeof video.title === 'string' && Number.isFinite(video.duration) ? [video] : [];
  });
  const byId = new Map(videos.map((video) => [video.id, video]));
  const assets = matchMuxAssetsToVimeo(muxAssets, videos).map((matched) => {
    const sourceId = matched.vimeoMatch?.id || matched.vimeoId;
    const source = sourceId ? byId.get(sourceId) : undefined;
    const saved = metadata[matched.id];
    return {
      ...matched,
      title: saved?.title || source?.customTitle?.trim() || source?.title?.trim() || matched.title,
      client: saved?.client || matched.client || source?.client?.trim() || null,
      localTags: saved?.tags ?? (Array.isArray(source?.localTags) ? source.localTags : []),
      libraryStatus: saved?.status || source?.libraryStatus || 'unreviewed',
      thumbnailTime: saved?.thumbnailTime ?? 1,
      hasCustomThumbnail: saved?.thumbnailTime !== null && saved?.thumbnailTime !== undefined,
      thumbnailUrl: matched.playbackId && saved?.thumbnailTime !== null && saved?.thumbnailTime !== undefined ? muxThumbnailUrl(matched.playbackId, saved.thumbnailTime) : matched.thumbnailUrl,
      downloadsEnabled: saved?.downloadsEnabled !== false,
      historicTitle: source?.title || matched.historicTitle,
      historicCreatedAt: source?.createdAt || matched.historicCreatedAt,
      historicClient: source?.client || matched.historicClient,
      historicFolderPath: source?.folderPath || matched.historicFolderPath,
    } satisfies MatchedMuxLibraryAsset & { thumbnailTime: number; hasCustomThumbnail: boolean; downloadsEnabled: boolean };
  });
  return { assets, ...store };
}
