import { matchMuxAssetsToVimeo, type MatchedMuxLibraryAsset, type VimeoMatchCandidate } from '../../lib/mux-matching';
import type { AdminEnvironment } from './admin';
import { getMuxLibraryAssets, muxThumbnailUrl } from './mux';
import { assignShortVideoUrls, readMuxMetadata, readVideoProjectStore } from './mux-state';
import { readVimeoLibrary } from './vimeo-state';
import publishedLibrarySeed from '../../lib/published-vimeo-library.json';

type VimeoRecord = VimeoMatchCandidate & {
  createdAt?: string | null;
  folderPath?: string | null;
  localTags?: string[];
  libraryStatus?: 'unreviewed' | 'published' | 'hidden';
};

export async function readEnrichedMuxLibrary(env: AdminEnvironment) {
  const [muxAssets, metadata, initialStore, vimeo] = await Promise.all([
    getMuxLibraryAssets(env),
    readMuxMetadata(env),
    readVideoProjectStore(env),
    readVimeoLibrary(env),
  ]);
  const migration = await assignShortVideoUrls(env, muxAssets);
  const store = migration.updated ? await readVideoProjectStore(env) : initialStore;
  // Keep the published archive available as a safety net for historic timeline
  // data. In production, the D1 library remains the source of truth; matching
  // records are merged by Vimeo ID so its current metadata wins while any
  // missing historic fields (especially createdAt) are retained.
  const publishedVideos = publishedLibrarySeed.videos as VimeoRecord[];
  const storedVideos = (vimeo?.videos ?? []) as VimeoRecord[];
  const storedById = new Map(storedVideos.map((video) => [video.id, video]));
  const publishedIds = new Set(publishedVideos.map((video) => video.id));
  const vimeoVideos = [
    ...publishedVideos.map((published) => {
      const stored = storedById.get(published.id);
      return stored
        ? { ...published, ...stored, createdAt: stored.createdAt || published.createdAt }
        : published;
    }),
    ...storedVideos.filter((video) => !publishedIds.has(video.id)),
  ];
  const videos = vimeoVideos.flatMap((raw) => {
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
      thumbnailUrl: matched.playbackId && saved?.thumbnailTime !== null && saved?.thumbnailTime !== undefined ? muxThumbnailUrl(matched.playbackId, saved.thumbnailTime) : matched.thumbnailUrl,
      downloadsEnabled: saved?.downloadsEnabled !== false,
      historicTitle: source?.title || matched.historicTitle,
      historicCreatedAt: source?.createdAt || matched.historicCreatedAt,
      historicClient: source?.client || matched.historicClient,
      historicFolderPath: source?.folderPath || matched.historicFolderPath,
    } satisfies MatchedMuxLibraryAsset & { thumbnailTime: number; downloadsEnabled: boolean };
  });
  return { assets, ...store };
}
