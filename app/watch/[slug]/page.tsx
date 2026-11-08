import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { SoloVideoPlayer, type SoloVideoVariant } from '@/components/SoloVideoPlayer';
import { getMuxLibraryAssets, muxThumbnailUrl } from '@/lib/mux-api';
import { getMuxLibraryMetadata } from '@/lib/mux-library-metadata';
import { matchMuxAssetsToVimeo } from '@/lib/mux-matching';
import { getVimeoLibrary } from '@/lib/vimeo-library';
import { getVideoProjectBySlug, getVideoProjectStore, ratioLabel } from '@/lib/video-projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ slug: string }> };

async function getWatchData(slug: string) {
  const [project, muxAssets, store, libraryMetadata, vimeoLibrary] = await Promise.all([
    getVideoProjectBySlug(slug),
    getMuxLibraryAssets({ tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET }),
    getVideoProjectStore(),
    getMuxLibraryMetadata(),
    getVimeoLibrary(),
  ]);
  const candidates = (vimeoLibrary?.videos ?? []).map((video) => ({
    id: video.id,
    title: video.title,
    customTitle: video.customTitle,
    client: video.client,
    duration: video.duration,
  }));
  const assets = matchMuxAssetsToVimeo(muxAssets, candidates).map((asset) => ({
    ...asset,
    title: libraryMetadata.titlesByAssetId[asset.id]?.trim() || asset.vimeoMatch?.title?.trim() || asset.title,
  }));
  const byId = new Map(assets.map((asset) => [asset.id, asset]));

  if (project) {
    const variants = project.variants.map((variant) => {
      const asset = byId.get(variant.assetId);
      if (!asset?.playbackId || asset.playbackPolicy !== 'public') return null;
      const thumbnailTime = libraryMetadata.thumbnailTimesByAssetId[asset.id];
      return {
        assetId: asset.id,
        label: variant.label,
        aspectRatio: asset.aspectRatio,
        playbackId: asset.playbackId,
        thumbnailUrl: thumbnailTime === undefined ? asset.thumbnailUrl : muxThumbnailUrl(asset.playbackId, thumbnailTime),
        duration: asset.duration,
        downloadsEnabled: libraryMetadata.downloadsEnabledByAssetId[asset.id] !== false,
        maxResolution: asset.maxResolution,
      } satisfies SoloVideoVariant;
    }).filter((variant): variant is SoloVideoVariant => Boolean(variant));
    return {
      title: project.title,
      client: project.client,
      description: project.description,
      variants,
      collections: store.collections.filter((collection) => project.collectionIds.includes(collection.id)),
    };
  }

  const asset = byId.get(slug);
  if (!asset) return null;
  const thumbnailTime = libraryMetadata.thumbnailTimesByAssetId[asset.id];
  const variants: SoloVideoVariant[] = asset.playbackId && asset.playbackPolicy === 'public' ? [{
    assetId: asset.id,
    label: ratioLabel(asset.aspectRatio),
    aspectRatio: asset.aspectRatio,
    playbackId: asset.playbackId,
    thumbnailUrl: thumbnailTime === undefined ? asset.thumbnailUrl : muxThumbnailUrl(asset.playbackId, thumbnailTime),
    duration: asset.duration,
    downloadsEnabled: libraryMetadata.downloadsEnabledByAssetId[asset.id] !== false,
    maxResolution: asset.maxResolution,
  }] : [];
  return {
    title: asset.title,
    client: libraryMetadata.clientsByAssetId[asset.id] || asset.historicClient || '',
    description: '',
    variants,
    collections: [],
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const video = await getWatchData((await params).slug);
  if (!video) return { title: 'Video — TranterGrey' };
  return { title: `${video.title} — TranterGrey`, description: video.description || `Watch ${video.title} by TranterGrey.`, robots: { index: false, follow: false } };
}

export default async function WatchPage({ params }: PageProps) {
  const video = await getWatchData((await params).slug);
  if (!video) notFound();

  return <main className="solo-video-page"><SiteHeader /><section className="solo-video-shell">
    <SoloVideoPlayer title={video.title} variants={video.variants} />
    <div className="solo-video-heading"><p className="eyebrow">TranterGrey film{video.client ? ` / ${video.client}` : ''}</p><h1>{video.title}</h1>{video.description && <p>{video.description}</p>}</div>
    {video.collections.length > 0 && <nav className="solo-video-collections" aria-label="Video collections"><span>Part of</span>{video.collections.map((collection) => <a href={`/watch/collection/${collection.slug}`} key={collection.id}>{collection.name} →</a>)}</nav>}
  </section><SiteFooter /></main>;
}
