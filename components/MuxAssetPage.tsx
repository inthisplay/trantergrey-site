'use client';

import { useEffect, useState } from 'react';
import { SiteHeader } from './SiteHeader';
import { MuxAssetActions } from './MuxAssetActions';
import type { MatchedMuxLibraryAsset } from '@/lib/mux-matching';
import type { VideoProject } from '@/lib/video-projects-shared';

type Asset = MatchedMuxLibraryAsset & { thumbnailTime: number; downloadsEnabled: boolean };
function duration(value: number) { const minutes = Math.floor(value / 60); return `${minutes}:${String(value % 60).padStart(2, '0')}`; }
function date(value: string | null) { if (!value) return 'Unavailable'; const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value); return Number.isNaN(parsed.getTime()) ? 'Unavailable' : new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(parsed); }

export function MuxAssetPage() {
  const [asset, setAsset] = useState<Asset | null>(null); const [project, setProject] = useState<VideoProject | null>(null); const [error, setError] = useState('');
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id') || '';
    fetch('/api/mux/library', { cache: 'no-store' }).then(async (response) => {
      if (response.status === 401) { window.location.replace(`/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`); return null; }
      const payload = await response.json() as { assets?: Asset[]; projects?: VideoProject[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Unable to open this Mux video.');
      const found = payload.assets?.find((item) => item.id === id); if (!found) throw new Error('That Mux video could not be found.');
      setAsset(found); setProject(payload.projects?.find((item) => item.variants.some((variant) => variant.assetId === id)) || null); document.title = `${found.title} — TranterGrey Admin`; return null;
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to open this Mux video.'));
  }, []);
  if (!asset) return <main className="admin-detail mux-asset-page"><SiteHeader adminArea /><section><a className="admin-back" href="/admin/mux">← Mux library</a><p className="admin-empty">{error || 'Opening Mux video…'}</p></section></main>;
  return <main className="admin-detail mux-asset-page"><SiteHeader adminArea /><section><a className="admin-back" href="/admin/mux">← Mux library</a><div className="mux-asset-workspace"><div className="mux-asset-main">
    <div className="mux-asset-player">{asset.playerUrl ? <iframe src={asset.playerUrl} title={asset.title} allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen /> : <p>Public playback is not available for this asset.</p>}</div>
    <div className="mux-asset-heading"><div><p className="eyebrow">{asset.client || 'Unassigned'} / {asset.status}</p><h1>{asset.title}</h1></div>{project && <a href={`/watch/${project.slug}`} target="_blank" rel="noreferrer">Open shareable page ↗</a>}</div>
    <dl className="mux-asset-details"><div><dt>Client</dt><dd>{asset.client || 'Unassigned'}</dd></div><div><dt>Duration</dt><dd>{duration(asset.duration)}</dd></div><div><dt>Aspect ratio</dt><dd>{asset.aspectRatio || 'Unavailable'}</dd></div><div><dt>Resolution</dt><dd>{asset.resolution || 'Unavailable'}</dd></div><div><dt>Original date</dt><dd>{date(asset.historicCreatedAt || asset.createdAt)}</dd></div><div><dt>Mux upload</dt><dd>{date(asset.createdAt)}</dd></div><div><dt>Playback</dt><dd>{asset.playbackPolicy || 'Unavailable'}</dd></div><div><dt>Mux asset ID</dt><dd><code>{asset.id}</code></dd></div>{asset.historicFolderPath && <div><dt>Historic folder</dt><dd>{asset.historicFolderPath}</dd></div>}<div><dt>Vimeo connection</dt><dd>{asset.vimeoMatch ? `${asset.vimeoMatch.title} (${asset.vimeoMatch.id})` : asset.vimeoSuggestion ? `Possible match: ${asset.vimeoSuggestion.title}` : 'No confident match'}</dd></div>{project && <div><dt>Video page</dt><dd>{project.title} · {project.variants.length} {project.variants.length === 1 ? 'ratio' : 'ratios'}</dd></div>}</dl>
  </div><aside className="mux-asset-sidebar" aria-label="Video settings"><MuxAssetActions assetId={asset.id} playbackId={asset.playbackId} playbackPolicy={asset.playbackPolicy} staticRenditions={asset.staticRenditions} projectSlug={project?.slug ?? null} duration={asset.duration} thumbnailTime={asset.thumbnailTime} thumbnailUrl={asset.thumbnailUrl} downloadsEnabled={asset.downloadsEnabled} /></aside></div></section></main>;
}
