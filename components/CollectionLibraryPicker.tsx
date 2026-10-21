'use client';

import { useMemo, useState } from 'react';

type Video = { id: string; title: string; customTitle?: string | null; description?: string; tags: string[]; localTags?: string[]; client?: string | null; thumbnailUrl?: string | null; duration: number; libraryStatus: 'unreviewed' | 'published' | 'hidden' };
type Collection = { id: string; name: string; slug: string; includePublished: boolean; videoIds: string[]; isPrivate: boolean };
const pageSize = 48;

export function CollectionLibraryPicker({ collection, videos, onSaved }: { collection: Collection; videos: Video[]; onSaved: (collection: Collection) => void }) {
  const [selected, setSelected] = useState(() => new Set(collection.videoIds));
  const [status, setStatus] = useState<'unreviewed' | 'published' | 'hidden'>('unreviewed');
  const [query, setQuery] = useState('');
  const [client, setClient] = useState('');
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [isPrivate, setIsPrivate] = useState(collection.isPrivate);
  const clients = useMemo(() => [...new Set(videos.map((video) => video.client).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b)), [videos]);
  const totals = useMemo(() => ({ unreviewed: videos.filter((video) => video.libraryStatus === 'unreviewed').length, published: videos.filter((video) => video.libraryStatus === 'published').length, hidden: videos.filter((video) => video.libraryStatus === 'hidden').length }), [videos]);
  const matched = useMemo(() => videos.filter((video) => video.libraryStatus === status && (!client || video.client === client) && (!query.trim() || [video.customTitle, video.title, video.description, ...(video.tags ?? []), ...(video.localTags ?? [])].filter(Boolean).join(' ').toLowerCase().includes(query.trim().toLowerCase()))), [videos, status, client, query]);
  const pages = Math.max(1, Math.ceil(matched.length / pageSize));
  const currentPage = Math.min(page, pages);
  const shown = matched.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  async function save() {
    setSaving(true); setMessage('');
    const videoIds = [...selected];
    try {
      const response = await fetch('/api/admin/collections', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: collection.id, videoIds, isPrivate }) });
      const payload = await response.json() as { collection?: Collection; error?: string };
      if (!response.ok || !payload.collection) throw new Error(payload.error || 'Could not save this selection.');
      onSaved(payload.collection); setMessage('Collection saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save this selection.'); }
    finally { setSaving(false); }
  }
  const shareUrl = typeof window === 'undefined' ? `/our-work/collections?collection=${encodeURIComponent(collection.slug)}` : `${window.location.origin}/our-work/collections?collection=${encodeURIComponent(collection.slug)}`;
  return <section className="collection-library-picker"><div className="collection-picker-intro"><div><p className="eyebrow">Curate {collection.name}</p><h2>Choose from the full<br /><em>library.</em></h2><p>Search, filter, and add the videos that belong in this collection. Your selection saves independently from the main Our Work page.</p></div><div className="collection-selection-actions"><strong>{selected.size.toLocaleString()} selected</strong><button className="connect-button" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save collection'}</button></div></div><div className="collection-visibility"><label className="collection-checkbox"><input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} /><span><b>Keep this collection unlisted</b><i>{isPrivate ? 'It stays public at its direct URL, but does not appear on the Collections page.' : 'It appears in the public Collections directory.'}</i></span></label><a href={shareUrl} target="_blank" rel="noreferrer">Open collection ↗</a></div><div className="curation-search collection-picker-search"><label><span>Search title, description, Vimeo, or private tags</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search the library" /></label><label className="client-filter"><span>Client</span><select value={client} onChange={(event) => { setClient(event.target.value); setPage(1); }}><option value="">All clients</option>{clients.map((name) => <option value={name} key={name}>{name}</option>)}</select></label><a className="clear-library-form" href="#clear" onClick={(event) => { event.preventDefault(); setQuery(''); setClient(''); setPage(1); }}>Clear</a></div><div className="curation-tabs">{(['unreviewed', 'published', 'hidden'] as const).map((item) => <a href={`#${item}`} className={status === item ? 'active' : ''} onClick={(event) => { event.preventDefault(); setStatus(item); setPage(1); }} key={item}>{item}<span>{totals[item].toLocaleString()}</span></a>)}</div>{message && <p className="admin-form-error">{message}</p>}<p className="curation-count">{matched.length.toLocaleString()} matching videos · page {currentPage} of {pages}</p><div className="collection-library-grid">{shown.map((video) => <button type="button" className={selected.has(video.id) ? 'is-selected' : ''} onClick={() => toggle(video.id)} key={video.id}>{video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" /> : <span className="collection-library-empty">Vimeo</span>}<span><b>{video.customTitle || video.title}</b><i>{video.client || 'No client'} · {video.libraryStatus}</i></span><em>{selected.has(video.id) ? 'Selected' : 'Add'}</em></button>)}</div><nav className="curation-pagination">{currentPage > 1 && <a href="#previous" onClick={(event) => { event.preventDefault(); setPage(currentPage - 1); }}>← Previous</a>}{currentPage < pages && <a href="#next" onClick={(event) => { event.preventDefault(); setPage(currentPage + 1); }}>Next →</a>}</nav></section>;
}
