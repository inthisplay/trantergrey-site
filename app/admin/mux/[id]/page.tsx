import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { MuxAssetActions } from '@/components/MuxAssetActions';
import { requireAdminPage } from '@/lib/admin-auth';
import { getMuxLibraryAssets, muxThumbnailUrl } from '@/lib/mux-api';
import { getMuxLibraryMetadata } from '@/lib/mux-library-metadata';
import { matchMuxAssetsToVimeo } from '@/lib/mux-matching';
import { getVimeoLibrary } from '@/lib/vimeo-library';
import { getVideoProjectStore } from '@/lib/video-projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ id: string }> };

function duration(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formattedDate(value: string | null) {
  if (!value) return 'Unavailable';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(date);
}

export default async function MuxAssetPage({ params }: PageProps) {
  const { id } = await params;
  await requireAdminPage(`/admin/mux/${id}`);
  const [muxAssets, library, metadata, projectStore] = await Promise.all([
    getMuxLibraryAssets({ tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET }),
    getVimeoLibrary(),
    getMuxLibraryMetadata(),
    getVideoProjectStore(),
  ]);
  const candidates = (library?.videos ?? []).map((video) => ({ id: video.id, title: video.title, customTitle: video.customTitle, client: video.client, duration: video.duration }));
  const asset = matchMuxAssetsToVimeo(muxAssets, candidates).map((item) => ({
    ...item,
    title: metadata.titlesByAssetId[item.id]?.trim() || item.vimeoMatch?.title?.trim() || item.title,
    client: metadata.clientsByAssetId[item.id] || item.client,
  })).find((item) => item.id === id);
  if (!asset) notFound();
  const project = projectStore.projects.find((item) => item.variants.some((variant) => variant.assetId === asset.id));
  const thumbnailTime = metadata.thumbnailTimesByAssetId[asset.id] ?? 1;
  const thumbnailUrl = asset.playbackId ? muxThumbnailUrl(asset.playbackId, thumbnailTime) : asset.thumbnailUrl;

  return <main className="admin-detail mux-asset-page"><SiteHeader adminArea /><section><a className="admin-back" href="/admin/mux">← Mux library</a>
    <div className="mux-asset-workspace"><div className="mux-asset-main">
      <div className="mux-asset-player">{asset.playerUrl ? <iframe src={asset.playerUrl} title={asset.title} allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen /> : <p>Public playback is not available for this asset.</p>}</div>
      <div className="mux-asset-heading"><div><p className="eyebrow">{asset.client || 'Unassigned'} / {asset.status}</p><h1>{asset.title}</h1></div>{project && <a href={`/watch/${project.slug}`} target="_blank" rel="noreferrer">Open shareable page ↗</a>}</div>
      <dl className="mux-asset-details"><div><dt>Client</dt><dd>{asset.client || 'Unassigned'}</dd></div><div><dt>Duration</dt><dd>{duration(asset.duration)}</dd></div><div><dt>Aspect ratio</dt><dd>{asset.aspectRatio || 'Unavailable'}</dd></div><div><dt>Resolution</dt><dd>{asset.resolution || 'Unavailable'}</dd></div><div><dt>Original date</dt><dd>{formattedDate(asset.historicCreatedAt || asset.createdAt)}</dd></div><div><dt>Mux upload</dt><dd>{formattedDate(asset.createdAt)}</dd></div><div><dt>Playback</dt><dd>{asset.playbackPolicy || 'Unavailable'}</dd></div><div><dt>Mux asset ID</dt><dd><code>{asset.id}</code></dd></div>{asset.historicFolderPath && <div><dt>Historic folder</dt><dd>{asset.historicFolderPath}</dd></div>}<div><dt>Vimeo connection</dt><dd>{asset.vimeoMatch ? `${asset.vimeoMatch.title} (${asset.vimeoMatch.id})` : asset.vimeoSuggestion ? `Possible match: ${asset.vimeoSuggestion.title}` : 'No confident match'}</dd></div>{project && <div><dt>Video page</dt><dd>{project.title} · {project.variants.length} {project.variants.length === 1 ? 'ratio' : 'ratios'}</dd></div>}</dl>
    </div><aside className="mux-asset-sidebar" aria-label="Video settings"><MuxAssetActions assetId={asset.id} playbackId={asset.playbackId} playbackPolicy={asset.playbackPolicy} staticRenditions={asset.staticRenditions} projectSlug={project?.slug ?? null} duration={asset.duration} thumbnailTime={thumbnailTime} thumbnailUrl={thumbnailUrl} downloadsEnabled={metadata.downloadsEnabledByAssetId[asset.id] !== false} /></aside></div>
  </section></main>;
}
