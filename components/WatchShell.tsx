'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { WatchDownloadIcon, WatchShareIcon } from './WatchActionIcons';
import { WatchHeaderActions } from './WatchHeader';
import { SoloVideoPlayer, type SoloVideoVariant } from './SoloVideoPlayer';
import { ExternalLink } from 'pixelarticons/react';
import { CollectionDownloads } from './CollectionDownloads';
import { VideoModal, type ModalVideo } from './VideoModal';
import type { VideoProjectCollection, VideoProjectVariant } from '@/lib/video-projects-shared';

type VideoData = { pending?: boolean; clientLogoUrl?: string | null; title: string; client: string | null; description: string | null; unbrandedPublicPage: boolean; variants: SoloVideoVariant[]; collections: VideoProjectCollection[] };
type CollectionData = { collection: VideoProjectCollection; downloadAssetIds: string[]; projects: Array<{ id: string; title: string; slug: string; client: string | null; variants: VideoProjectVariant[]; thumbnailUrl: string | null }> };

export function WatchShell({ unbranded = false, linkBase = '/watch', compactPlayer = false, headerActions = false }: { unbranded?: boolean; linkBase?: string; compactPlayer?: boolean; headerActions?: boolean }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const [video, setVideo] = useState<VideoData | null>(null);
  const [collection, setCollection] = useState<CollectionData | null>(null);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [copyNotice, setCopyNotice] = useState('');
  async function copyCollectionUrl() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyNotice('Copied!');
    } catch {
      setCopyNotice('Could not copy. Copy the URL from your address bar.');
    }
  }
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<(ModalVideo & { variants: SoloVideoVariant[]; href: string }) | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [loadingSlug, setLoadingSlug] = useState('');
  const previewRequest = useRef<AbortController | null>(null);
  const previewTrigger = useRef<HTMLAnchorElement | null>(null);

  const closePreview = useCallback(() => {
    setPreview(null);
    previewTrigger.current?.focus();
  }, []);

  async function openPreview(event: React.MouseEvent<HTMLAnchorElement>, project: CollectionData['projects'][number]) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    previewTrigger.current = event.currentTarget;
    previewRequest.current?.abort();
    const controller = new AbortController();
    previewRequest.current = controller;
    setLoadingSlug(project.slug);
    setPreviewError('');
    try {
      const response = await fetch(`/api/watch/${encodeURIComponent(project.slug)}`, { signal: controller.signal });
      const { video } = await response.json() as { video?: VideoData };
      const variant = video?.variants[0];
      if (!response.ok || !video || !variant) throw new Error('Video unavailable');
      if (!controller.signal.aborted) {
        setPreview({ id: variant.assetId, title: video.title, client: video.client || project.client || 'TranterGrey', thumbnail: variant.thumbnailUrl || project.thumbnailUrl || '', muxPlaybackId: variant.playbackId, variants: video.variants, href: `${linkBase}/${project.slug}` });
      }
    } catch {
      if (!controller.signal.aborted) setPreviewError(`Could not open “${project.title}.” Try again or open its video page.`);
    } finally {
      if (!controller.signal.aborted) setLoadingSlug('');
    }
  }


  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const collectionSlug = search.get('collection');
    const videoSlug = search.get('slug') || (unbranded ? window.location.pathname.split('/').filter(Boolean).at(-1) : '');
    const isCollection = Boolean(collectionSlug);
    const slug = collectionSlug || videoSlug || '';
    if (!slug) { setError('This video link is incomplete.'); return; }
    const endpoint = isCollection ? `/api/watch/collection/${encodeURIComponent(slug)}` : `/api/watch/${encodeURIComponent(slug)}`;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let retryable = true;
    const load = () => fetch(endpoint, { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      const payload = await response.json() as { video?: VideoData; collection?: VideoProjectCollection; downloadAssetIds?: string[]; projects?: CollectionData['projects']; error?: string };
      if (!response.ok) { retryable = response.status >= 500 || response.status === 429; throw new Error(payload.error || 'This page is unavailable.'); }
      retryable = true;
      if (isCollection && payload.collection) { setCollection({ collection: payload.collection, projects: payload.projects ?? [], downloadAssetIds: payload.downloadAssetIds ?? [] }); document.title = `${payload.collection.name} — TranterGrey`; }
      else if (payload.video) { if (controller.signal.aborted) return; setVideo(payload.video);
        if (payload.video.pending || payload.video.variants.some(variant => variant.status && !['ready', 'errored'].includes(variant.status))) timer = setTimeout(load, 5000); document.title = `${payload.video.title} — TranterGrey`; }
      else throw new Error('This page is unavailable.');
    }).catch((reason) => { if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : 'This page is unavailable.'); if (retryable) timer = setTimeout(load, 15000); } });
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!preview?.variants.some(variant => variant.status && !['ready', 'errored'].includes(variant.status))) return;
    const href = preview.href;
    const slug = href.split('/').at(-1)!;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(`/api/watch/${encodeURIComponent(slug)}`, { cache: 'no-store', signal: controller.signal });
        if (response.ok) {
          const { video } = await response.json() as { video?: VideoData };
          if (video && !controller.signal.aborted) setPreview(current => current?.href === href ? { ...current, variants: video.variants } : current);
          if (video && video.variants.every(variant => !variant.status || ['ready', 'errored'].includes(variant.status))) return;
        }
      } catch { /* Keep the received state and retry after temporary outages. */ }
      if (!controller.signal.aborted) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 5000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [preview?.href]);

  if (video && !video.variants.length) return <section className="solo-video-shell"><h1>{video.title}</h1><p role="status">{video.pending ? 'Video received. Preparing playback… This page will update automatically.' : 'Playback is not available for this video.'}</p></section>;

  if (collection) return <section className="solo-video-shell collection-page">
    <header className="solo-collection-header">
      <div className="solo-video-heading"><p className="eyebrow">TranterGrey collection</p><h1>{collection.collection.name}</h1>{collection.collection.description && <p>{collection.collection.description}</p>}</div>
      <WatchHeaderActions enabled={headerActions}><div className="solo-collection-download"><div className="solo-video-action-buttons">
        <button type="button" onClick={() => void copyCollectionUrl()}><WatchShareIcon />{copyNotice === 'Copied!' ? 'Copied!' : 'Copy URL'}</button>
        {collection.downloadAssetIds.length > 0 && <button type="button" aria-expanded={downloadsOpen} onClick={() => setDownloadsOpen(open => !open)}><WatchDownloadIcon />{downloadsOpen ? 'Close downloads' : 'Download videos'}</button>}</div>
        <div role="status">{copyNotice}</div>
      </div>
    </WatchHeaderActions></header>
    {downloadsOpen && <CollectionDownloads items={Array.from(new Map(collection.projects.flatMap(project => project.variants.filter(variant => collection.downloadAssetIds.includes(variant.assetId)).map(variant => [variant.assetId, {assetId: variant.assetId, label: `${project.title} — ${variant.label || variant.aspectRatio || 'Video'}`} ] as const))).values())} />}
    {previewError && <p role="alert">{previewError}</p>}
    {collection.projects.length ? <div className="solo-collection-grid balanced-video-grid">{collection.projects.map((project) => {
      const href = `${linkBase}/${project.slug}`;
      return <article className="solo-collection-card" key={project.id}>
        <a href={href} onClick={(event) => void openPreview(event, project)} aria-haspopup="dialog" aria-busy={loadingSlug === project.slug}>
          <span>{project.thumbnailUrl ? <img src={project.thumbnailUrl} alt="" /> : <i>Preview unavailable</i>}</span>
          <small>{project.client || 'TranterGrey'} · {project.variants.length} {project.variants.length === 1 ? 'ratio' : 'ratios'}</small>
          <h2>{project.title}</h2>
        </a>
        <div className="solo-collection-actions">
          <a className="solo-collection-open" href={href} target="_blank" rel="noopener" aria-label={`Open ${project.title} in a new tab`}>
            <ExternalLink aria-hidden="true" />
            <span aria-hidden="true">Open video page in a new tab</span>
          </a>
        </div>
      </article>;
    })}</div> : <p className="solo-video-unavailable">No videos have been added to this collection yet.</p>}
    <VideoModal video={preview} onClose={closePreview}>
      {preview && <div className="video-ratio-preview">
        <SoloVideoPlayer key={preview.href} title={preview.title} variants={preview.variants} standaloneHref={preview.href} compact={compactPlayer} />
      </div>}
    </VideoModal>
  </section>;

  if (unbranded) return <section className="unbranded-video-page"><div className="unbranded-video-frame">
    {video?.unbrandedPublicPage && video.clientLogoUrl && !logoFailed && <header className="unbranded-client-header"><img src={video.clientLogoUrl} alt={`${video.client || 'Client'} logo`} onError={()=>setLogoFailed(true)}/></header>}
    {video?.unbrandedPublicPage
      ? <SoloVideoPlayer title={video.title} variants={video.variants} unbranded />
      : <p className="solo-video-unavailable">This video does not have an unbranded page enabled.</p>}
  </div></section>;

  return <section className="solo-video-shell">
    {video ? <div className="solo-video-presentation"><div className="solo-video-public-media-region"><SoloVideoPlayer title={video.title} variants={video.variants} compact={compactPlayer} headerActions={headerActions} /></div><div className="solo-video-heading"><p className="eyebrow">TranterGrey film{video.client ? ` / ${video.client}` : ''}</p><h1>{video.title}</h1>{video.description && <p>{video.description}</p>}</div>{video.collections.length > 0 && <nav className="solo-video-collections" aria-label="Video collections"><span>Part of</span>{video.collections.map((item) => <a href={`${linkBase}/collection/${item.slug}`} key={item.id}>{item.name} <UiIcon name="forward" /></a>)}</nav>}</div> : <div className="solo-video-heading"><p className="eyebrow">TranterGrey film</p><h1>{error || 'Opening video…'}</h1></div>}
  </section>;
}

import { UiIcon } from '@/components/UiIcon';
