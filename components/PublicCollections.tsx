'use client';

import { useEffect, useState } from 'react';
import { VideoGallery } from './VideoGallery';
import type { Video } from '@/lib/videos';

type Listing = { name: string; slug: string; videoCount: number };
type Detail = { name: string; slug: string; isPrivate: boolean; videos: Video[] };

export function PublicCollections() {
  const [slug, setSlug] = useState<string | null | undefined>(undefined);
  const [collections, setCollections] = useState<Listing[] | null>(null);
  const [collection, setCollection] = useState<Detail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => setSlug(new URLSearchParams(window.location.search).get('collection')), []);
  useEffect(() => {
    if (slug === undefined) return;
    const endpoint = slug ? `/api/work/collections?slug=${encodeURIComponent(slug)}` : '/api/work/collections';
    fetch(endpoint).then(async (response) => {
      const payload = await response.json() as { collections?: Listing[]; collection?: Detail; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Unable to load this collection.');
      if (slug) setCollection(payload.collection ?? null); else setCollections(payload.collections ?? []);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load collections.'));
  }, [slug]);

  if (slug) return <section className="public-collection-detail"><a className="collection-back-link" href="/our-work/collections">← All collections</a>{error ? <p className="work-empty">{error}</p> : !collection ? <p className="work-empty">Opening collection…</p> : <><div className="public-collection-detail-head"><p className="eyebrow">Our Work / Collection</p><h1>{collection.name}</h1><p>{collection.isPrivate ? 'A focused TranterGrey selection, shared directly.' : 'A focused TranterGrey selection.'}</p></div>{collection.videos.length ? <VideoGallery videos={collection.videos} /> : <p className="work-empty">This collection does not have any films yet.</p>}</>}</section>;
  return <section className="work-collections-intro"><p className="eyebrow">Our Work / Collections</p><h1>Focused<br /><em>edits.</em></h1><p>Collections bring together films that share a subject, style, or point of view.</p>{error ? <p className="work-empty">{error}</p> : !collections ? <p className="work-empty">Opening collections…</p> : collections.length ? <div className="public-collections-grid">{collections.map((item) => <a href={`/our-work/collections?collection=${encodeURIComponent(item.slug)}`} key={item.slug}><span>{item.videoCount} {item.videoCount === 1 ? 'film' : 'films'}</span><strong>{item.name}</strong><i>Open collection ↗</i></a>)}</div> : <div className="public-collections-empty"><p>There are no public collections yet.</p><a className="connect-button" href="/our-work">Browse Our Work</a></div>}</section>;
}
