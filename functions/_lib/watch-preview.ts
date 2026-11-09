import type { AdminEnvironment } from './admin';
import { getMuxLibraryAsset, muxThumbnailUrl } from './mux';
import { readMuxMetadata, readVideoProjectStore } from './mux-state';

const logo = '/assets/tg-logo-white-red.png';

export async function watchPreview(env: AdminEnvironment, url: URL) {
  const collectionSlug = url.searchParams.get('collection');
  const videoSlug = url.searchParams.get('slug');
  if (!collectionSlug && !videoSlug) return null;

  const store = await readVideoProjectStore(env);
  const collection = collectionSlug ? store.collections.find((item) => item.slug === collectionSlug) : undefined;
  if (collectionSlug && !collection) return null;
  const project = collection
    ? store.projects.find((item) => item.collectionIds.includes(collection.id))
    : store.projects.find((item) => item.slug === videoSlug || (videoSlug && item.legacySlugs?.includes(videoSlug)));
  const assetId = project?.variants[0]?.assetId ?? (!collection && videoSlug && /^[A-Za-z0-9]+$/.test(videoSlug) ? videoSlug : null);
  const [asset, metadata] = assetId
    ? await Promise.all([getMuxLibraryAsset(env, assetId).catch(() => null), readMuxMetadata(env).catch(() => null)])
    : [null, null];
  const saved = assetId ? metadata?.[assetId] : undefined;
  const title = collection?.name || project?.title || (asset?.playbackPolicy === 'public' ? saved?.title || asset.title : null);
  if (!title) return null;
  const image = asset?.playbackPolicy === 'public' && asset.playbackId
    ? saved?.thumbnailTime != null ? muxThumbnailUrl(asset.playbackId, saved.thumbnailTime) : asset.thumbnailUrl
    : null;
  const pathname = collection ? `/watch/collection/${encodeURIComponent(collection.slug)}` : `/watch/${encodeURIComponent(project?.slug || assetId || '')}`;

  return {
    title,
    image: new URL(image || logo, url.origin).href,
    description: collection?.description || project?.description || (collection ? 'A video collection from TranterGrey.' : 'Watch a film by TranterGrey.'),
    url: new URL(pathname, url.origin).href,
  };
}
