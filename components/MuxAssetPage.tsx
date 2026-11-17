'use client';

import { useEffect, useState } from 'react';
import { SiteHeader } from './SiteHeader';
import { MuxAssetActions } from './MuxAssetActions';
import { MuxThemeToggle } from './MuxThemeToggle';
import { MuxVideoPlayer } from './SoloVideoPlayer';
import type { MatchedMuxLibraryAsset } from '@/lib/mux-matching';
import type { VideoProject, VideoProjectCollection } from '@/lib/video-projects-shared';

type Asset = MatchedMuxLibraryAsset & { thumbnailTime: number; hasCustomThumbnail: boolean; downloadsEnabled: boolean };
function duration(value: number) { const minutes = Math.floor(value / 60); return `${minutes}:${String(value % 60).padStart(2, '0')}`; }
function date(value: string | null) { if (!value) return 'Unavailable'; const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value); return Number.isNaN(parsed.getTime()) ? 'Unavailable' : new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(parsed); }

export function MuxAssetPage() {
  const [asset, setAsset] = useState<Asset | null>(null); const [assets, setAssets] = useState<Asset[]>([]); const [projects, setProjects] = useState<VideoProject[]>([]); const [project, setProject] = useState<VideoProject | null>(null); const [collection, setCollection] = useState<VideoProjectCollection | null>(null); const [error, setError] = useState('');
  useEffect(() => {
    const query = new URLSearchParams(window.location.search); const id = query.get('id') || ''; const collectionId = query.get('collection') || '';
    const requestQuery = new URLSearchParams({ id }); if (collectionId) requestQuery.set('collection', collectionId);
    fetch(`/api/mux/library?${requestQuery}`, { cache: 'no-store' }).then(async (response) => {
      if (response.status === 401) { window.location.replace(`/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`); return null; }
      const payload = await response.json() as { assets?: Asset[]; projects?: VideoProject[]; collections?: VideoProjectCollection[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Unable to open this Mux video.');
      const found = payload.assets?.find((item) => item.id === id); if (!found) throw new Error('That Mux video could not be found.');
      setAssets(payload.assets ?? []); setProjects(payload.projects ?? []); setAsset(found); setProject(payload.projects?.find((item) => item.variants.some((variant) => variant.assetId === id)) || null); setCollection(payload.collections?.find((item) => item.id === collectionId) || null); document.title = `${found.title} — TranterGrey Admin`; return null;
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to open this Mux video.'));
  }, []);
  if (!asset) return <main className="admin-detail mux-asset-page mux-theme-workspace"><SiteHeader adminArea /><section><div className="mux-asset-toolbar"><a className="admin-back" href="/admin/mux">← Mux library</a><MuxThemeToggle /></div><p className="admin-empty">{error || 'Opening Mux video…'}</p></section></main>;
  const ratioAssets = project ? project.variants.flatMap((variant) => {
    const matchingAsset = assets.find((item) => item.id === variant.assetId);
    return matchingAsset ? [{ asset: matchingAsset, label: variant.label || matchingAsset.aspectRatio || 'Version' }] : [];
  }) : [];
  const isRatioWorkspace = ratioAssets.length > 1;
  const collectionProjects = collection ? projects.flatMap((collectionProject) => {
    if (!collectionProject.collectionIds.includes(collection.id)) return [];
    const representative = collectionProject.variants.map((variant) => assets.find((item) => item.id === variant.assetId)).find((item): item is Asset => Boolean(item));
    return representative ? [{ project: collectionProject, representative }] : [];
  }) : [];
  const managementHref = (nextAssetId: string) => `/admin/mux/${nextAssetId}${collection ? `?collection=${encodeURIComponent(collection.id)}` : ''}`;
  const selectRatio = (nextAsset: Asset) => {
    setAsset(nextAsset);
    window.history.replaceState(null, '', managementHref(nextAsset.id));
    document.title = `${nextAsset.title} — TranterGrey Admin`;
  };
  const selectCollectionProject = (nextProject: VideoProject, nextAsset: Asset) => {
    setProject(nextProject);
    selectRatio(nextAsset);
  };
  return <main className="admin-detail mux-asset-page mux-theme-workspace"><SiteHeader adminArea /><section><div className="mux-asset-toolbar"><a className="admin-back" href="/admin/mux">← Mux library</a><MuxThemeToggle /></div><div className="mux-asset-workspace"><div className="mux-asset-main">
    {collection && <nav className="mux-collection-workspace" aria-label={`${collection.name} videos`}><header><span>Collection workspace</span><strong>{collection.name}</strong></header><div>{collectionProjects.map(({ project: collectionProject, representative }) => <button key={collectionProject.id} type="button" aria-selected={project?.id === collectionProject.id} onClick={() => selectCollectionProject(collectionProject, representative)}><span>{representative.thumbnailUrl ? <img src={representative.thumbnailUrl} alt="" /> : <i>Preview unavailable</i>}{collectionProject.variants.length > 1 && <b>{collectionProject.variants.length} ratios</b>}</span><em>{collectionProject.title}</em></button>)}</div></nav>}
    {isRatioWorkspace && <nav className="mux-ratio-tabs" aria-label="Ratio versions">{ratioAssets.map(({ asset: ratioAsset, label }) => <button key={ratioAsset.id} type="button" aria-selected={asset.id === ratioAsset.id} onClick={() => selectRatio(ratioAsset)}><span>{label}</span><small>{ratioAsset.resolution || ratioAsset.aspectRatio || 'Mux version'}</small></button>)}</nav>}
    <div className="mux-asset-player">{asset.playbackId && asset.playbackPolicy === 'public' ? <MuxVideoPlayer key={asset.id} assetId={asset.id} playbackId={asset.playbackId} poster={asset.thumbnailUrl} title={asset.title} /> : <p>Public playback is not available for this asset.</p>}</div>
    <div className="mux-asset-heading"><div><p className="eyebrow">{asset.client || 'Unassigned'} / {asset.status} / {asset.hasCustomThumbnail ? 'Thumbnail selected' : 'Needs thumbnail'}{isRatioWorkspace ? ` / ${asset.aspectRatio || 'Ratio version'}` : ''}</p><h1>{isRatioWorkspace ? project?.title : asset.title}</h1></div>{project && <a href={`/watch/${project.slug}`} target="_blank" rel="noreferrer">Open shareable page ↗</a>}</div>
    <dl className="mux-asset-details"><div><dt>Client</dt><dd>{asset.client || 'Unassigned'}</dd></div><div><dt>Duration</dt><dd>{duration(asset.duration)}</dd></div><div><dt>Aspect ratio</dt><dd>{asset.aspectRatio || 'Unavailable'}</dd></div><div><dt>Resolution</dt><dd>{asset.resolution || 'Unavailable'}</dd></div><div><dt>Original date</dt><dd>{date(asset.historicCreatedAt || asset.createdAt)}</dd></div><div><dt>Mux upload</dt><dd>{date(asset.createdAt)}</dd></div><div><dt>Playback</dt><dd>{asset.playbackPolicy || 'Unavailable'}</dd></div><div><dt>Mux asset ID</dt><dd><code>{asset.id}</code></dd></div>{asset.historicFolderPath && <div><dt>Historic folder</dt><dd>{asset.historicFolderPath}</dd></div>}<div><dt>Vimeo connection</dt><dd>{asset.vimeoMatch ? `${asset.vimeoMatch.title} (${asset.vimeoMatch.id})` : asset.vimeoSuggestion ? `Possible match: ${asset.vimeoSuggestion.title}` : 'No confident match'}</dd></div>{project && <div><dt>Video page</dt><dd>{project.title} · {project.variants.length} {project.variants.length === 1 ? 'ratio' : 'ratios'}</dd></div>}</dl>
  </div><aside className="mux-asset-sidebar" aria-label="Video settings"><MuxAssetActions assetId={asset.id} title={asset.title} playbackId={asset.playbackId} playbackPolicy={asset.playbackPolicy} staticRenditions={asset.staticRenditions} projectId={project?.id ?? null} projectSlug={project?.slug ?? null} unbrandedPublicPage={project?.unbrandedPublicPage === true} duration={asset.duration} thumbnailTime={asset.thumbnailTime} thumbnailUrl={asset.thumbnailUrl} downloadsEnabled={asset.downloadsEnabled} /></aside></div></section></main>;
}
