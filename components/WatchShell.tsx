'use client';

import { useEffect, useState } from 'react';
import { SoloVideoPlayer, type SoloVideoVariant } from './SoloVideoPlayer';
import type { VideoProjectCollection } from '@/lib/video-projects-shared';

type VideoData = { title: string; client: string | null; description: string | null; variants: SoloVideoVariant[]; collections: VideoProjectCollection[] };
type CollectionData = { collection: VideoProjectCollection; projects: Array<{ id: string; title: string; slug: string; client: string | null; variants: unknown[]; thumbnailUrl: string | null }> };

export function WatchShell() {
  const [video, setVideo] = useState<VideoData | null>(null);
  const [collection, setCollection] = useState<CollectionData | null>(null);
  const [error, setError] = useState('');

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
    {collection.projects.length ? <div className="solo-collection-grid">{collection.projects.map((project) => <a href={`/watch/${project.slug}`} key={project.id}><span>{project.thumbnailUrl ? <img src={project.thumbnailUrl} alt="" /> : <i>Preview unavailable</i>}</span><small>{project.client || 'TranterGrey'} · {project.variants.length} {project.variants.length === 1 ? 'ratio' : 'ratios'}</small><h2>{project.title}</h2></a>)}</div> : <p className="solo-video-unavailable">No videos have been added to this collection yet.</p>}
  </section>;

  return <section className="solo-video-shell">
    {video ? <div className="solo-video-presentation"><SoloVideoPlayer title={video.title} variants={video.variants} /><div className="solo-video-heading"><p className="eyebrow">TranterGrey film{video.client ? ` / ${video.client}` : ''}</p><h1>{video.title}</h1>{video.description && <p>{video.description}</p>}</div>{video.collections.length > 0 && <nav className="solo-video-collections" aria-label="Video collections"><span>Part of</span>{video.collections.map((item) => <a href={`/watch/collection/${item.slug}`} key={item.id}>{item.name} →</a>)}</nav>}</div> : <div className="solo-video-heading"><p className="eyebrow">TranterGrey film</p><h1>{error || 'Opening video…'}</h1></div>}
  </section>;
}
