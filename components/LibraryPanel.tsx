'use client';

import { useEffect, useMemo, useState } from 'react';
import { VimeoLibraryReview } from './VimeoLibraryReview';

type Video = { id: string; title: string; customTitle?: string | null; description?: string; tags: string[]; localTags?: string[]; client?: string | null; thumbnailUrl?: string | null; duration: number; createdAt?: string | null; privacy?: string | null; libraryStatus: 'unreviewed' | 'published' | 'hidden'; url?: string | null };
type Library = { importedAt: string; clients?: string[]; videos: Video[] };
const pageSize = 48;

export function LibraryPanel() {
  const [library, setLibrary] = useState<Library | null | undefined>(undefined);
  const [status, setStatus] = useState<'unreviewed' | 'published' | 'hidden'>('unreviewed');
  const [query, setQuery] = useState('');
  const [client, setClient] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => { fetch('/api/vimeo/library').then(async (response) => {
    if (response.status === 401) { window.location.replace('/login?next=/library'); return; }
    const payload = await response.json() as { library: Library | null; error?: string };
    if (!response.ok) throw new Error(payload.error || 'Unable to open the work library.');
    setLibrary(payload.library);
  }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to open the work library.')); }, []);

  const clients = useMemo(() => [...new Set([...(library?.clients ?? []), ...(library?.videos.map((video) => video.client).filter((name): name is string => Boolean(name)) ?? [])])].sort((a, b) => a.localeCompare(b)), [library]);
  const tags = useMemo(() => [...new Set(library?.videos.flatMap((video) => video.localTags ?? []) ?? [])].sort((a, b) => a.localeCompare(b)), [library]);
  const matched = useMemo(() => (library?.videos ?? []).filter((video) => video.libraryStatus === status && (!client || video.client === client) && (!query.trim() || [video.customTitle, video.title, video.description, ...(video.tags ?? []), ...(video.localTags ?? [])].filter(Boolean).join(' ').toLowerCase().includes(query.trim().toLowerCase()))), [library, status, client, query]);
  const pages = Math.max(1, Math.ceil(matched.length / pageSize));
  const currentPage = Math.min(page, pages);
  const totals = useMemo(() => ({ unreviewed: library?.videos.filter((video) => video.libraryStatus === 'unreviewed').length ?? 0, published: library?.videos.filter((video) => video.libraryStatus === 'published').length ?? 0, hidden: library?.videos.filter((video) => video.libraryStatus === 'hidden').length ?? 0 }), [library]);

  if (error) return <p className="admin-empty">{error}</p>;
  if (library === undefined) return <p className="admin-empty">Opening the work library…</p>;
  if (!library) return <p className="admin-empty">No Vimeo library yet. <a href="/connect-vimeo">Connect and import Vimeo first.</a></p>;
  const changeStatus = (next: typeof status) => { setStatus(next); setPage(1); };
  return <><div className="curation-search"><label><span>Search title, description, Vimeo, or private tags</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search the library" /></label><label className="client-filter"><span>Client</span><select value={client} onChange={(event) => { setClient(event.target.value); setPage(1); }}><option value="">All clients</option>{clients.map((name) => <option value={name} key={name}>{name}</option>)}</select></label><button type="button" onClick={() => { setQuery(''); setClient(''); setPage(1); }}>Clear</button></div><div className="curation-tabs">{(['unreviewed', 'published', 'hidden'] as const).map((item) => <button type="button" className={status === item ? 'active' : ''} onClick={() => changeStatus(item)} key={item}>{item}<span>{totals[item].toLocaleString()}</span></button>)}</div><div className="library-status-row"><p className="curation-count">{matched.length.toLocaleString()} matching videos · page {currentPage} of {pages} · {clients.length.toLocaleString()} saved clients · {tags.length.toLocaleString()} private tags</p><a href="/connect-vimeo#library-import">Check Vimeo / full rescan</a></div><VimeoLibraryReview videos={matched.slice((currentPage - 1) * pageSize, currentPage * pageSize) as never[]} clients={clients} localTags={tags} /><nav className="curation-pagination">{currentPage > 1 && <button type="button" onClick={() => setPage(currentPage - 1)}>← Previous</button>}{currentPage < pages && <button type="button" onClick={() => setPage(currentPage + 1)}>Next →</button>}</nav></>;
}
