'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SoloVideoPlayer, type SoloVideoVariant } from './SoloVideoPlayer';
import { ExternalLink, Grid2x22 } from 'pixelarticons/react';
import { CollectionDownload } from './CollectionDownload';
import { VideoModal, type ModalVideo } from './VideoModal';
import type { VideoProjectCollection } from '@/lib/video-projects-shared';

type VideoData = { title: string; client: string | null; description: string | null; variants: SoloVideoVariant[]; collections: VideoProjectCollection[] };
type CollectionData = { collection: VideoProjectCollection; projects: Array<{ id: string; title: string; slug: string; client: string | null; variants: unknown[]; downloadsEnabled?: boolean; thumbnailUrl: string | null }> };

export function WatchShell() {
  const [video, setVideo] = useState<VideoData | null>(null);
  const [collection, setCollection] = useState<CollectionData | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<(ModalVideo & { allRatios?: SoloVideoVariant[]; href: string }) | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [loadingSlug, setLoadingSlug] = useState('');
  const previewRequest = useRef<AbortController | null>(null);
  const previewTrigger = useRef<HTMLAnchorElement | null>(null);

  const closePreview = useCallback(() => {
    setPreview(null);
    previewTrigger.current?.focus();
  }, []);

  async function openPreview(event: React.MouseEvent<HTMLAnchorElement>, project: CollectionData['projects'][number], allRatios = false) {
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
        setPreview({ id: variant.assetId, title: video.title, client: video.client || project.client || 'TranterGrey', thumbnail: variant.thumbnailUrl || project.thumbnailUrl || '', muxPlaybackId: variant.playbackId, allRatios: allRatios ? video.variants : undefined, href: `/watch/${project.slug}` });
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
    const videoSlug = search.get('slug');
    const isCollection = Boolean(collectionSlug);
    const slug = collectionSlug || videoSlug || '';
    if (!slug) { setError('This video link is incomplete.'); return; }
    const endpoint = isCollection ? `/api/watch/collection/${encodeURIComponent(slug)}` : `/api/watch/${encodeURIComponent(slug)}`;
    fetch(endpoint, { cache: 'no-store' }).then(async (response) => {
      const payload = await response.json() as { video?: VideoData; collection?: VideoProjectCollection; projects?: CollectionData['projects']; error?: string };
      if (!response.ok) throw new Error(payload.error || 'This page is unavailable.');
      if (isCollection && payload.collection) { setCollection({ collection: payload.collection, projects: payload.projects ?? [] }); document.title = `${payload.collection.name} — TranterGrey`; }
      else if (payload.video) { setVideo(payload.video); document.title = `${payload.video.title} — TranterGrey`; }
      else throw new Error('This page is unavailable.');
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'This page is unavailable.'));
  }, []);

  if (collection) return <section className="solo-video-shell collection-page">
    <div className="solo-video-heading"><p className="eyebrow">TranterGrey collection</p><h1>{collection.collection.name}</h1>{collection.collection.description && <p>{collection.collection.description}</p>}</div>
    {previewError && <p role="alert">{previewError}</p>}
    {collection.projects.length ? <div className="solo-collection-grid">{collection.projects.map((project) => {
      const href = `/watch/${project.slug}`;
      return <article className="solo-collection-card" key={project.id}>
        <a href={href} onClick={(event) => void openPreview(event, project)} aria-haspopup="dialog" aria-busy={loadingSlug === project.slug}>
          <span>{project.thumbnailUrl ? <img src={project.thumbnailUrl} alt="" /> : <i>Preview unavailable</i>}</span>
          <small>{project.client || 'TranterGrey'} · {project.variants.length} {project.variants.length === 1 ? 'ratio' : 'ratios'}</small>
          <h2>{project.title}</h2>
        </a>
        <div className="solo-collection-actions">
          {project.variants.length > 1 && <a className="solo-collection-open" href={href} onClick={(event) => void openPreview(event, project, true)} aria-haspopup="dialog" aria-label={`View all ratios for ${project.title}`}>
            <Grid2x22 aria-hidden="true" />
            <span aria-hidden="true">View all ratios</span>
          </a>}
          {project.downloadsEnabled !== false && <CollectionDownload slug={project.slug} title={project.title} />}
          <a className="solo-collection-open" href={href} target="_blank" rel="noopener" aria-label={`Open ${project.title} in a new tab`}>
            <ExternalLink aria-hidden="true" />
            <span aria-hidden="true">Open video page in a new tab</span>
          </a>
        </div>
      </article>;
    })}</div> : <p className="solo-video-unavailable">No videos have been added to this collection yet.</p>}
    <VideoModal video={preview} onClose={closePreview}>
      {preview?.allRatios && <div className="collection-ratio-preview">
        <SoloVideoPlayer key={preview.href} title={preview.title} variants={preview.allRatios} standaloneHref={preview.href} />
      </div>}
    </VideoModal>
  </section>;

  return <section className="solo-video-shell">
    {video ? <div className="solo-video-presentation"><SoloVideoPlayer title={video.title} variants={video.variants} /><div className="solo-video-heading"><p className="eyebrow">TranterGrey film{video.client ? ` / ${video.client}` : ''}</p><h1>{video.title}</h1>{video.description && <p>{video.description}</p>}</div>{video.collections.length > 0 && <nav className="solo-video-collections" aria-label="Video collections"><span>Part of</span>{video.collections.map((item) => <a href={`/watch/collection/${item.slug}`} key={item.id}>{item.name} →</a>)}</nav>}</div> : <div className="solo-video-heading"><p className="eyebrow">TranterGrey film</p><h1>{error || 'Opening video…'}</h1></div>}
  </section>;
}
