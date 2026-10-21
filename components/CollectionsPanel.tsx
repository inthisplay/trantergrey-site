'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CollectionLibraryPicker } from './CollectionLibraryPicker';

type Collection = { id: string; name: string; slug: string; includePublished: boolean; videoIds: string[] };
type Video = { id: string; title: string; customTitle?: string | null; description?: string; tags: string[]; localTags?: string[]; client?: string | null; thumbnailUrl?: string | null; duration: number; libraryStatus: 'unreviewed' | 'published' | 'hidden' };
type Library = { videos: Video[] };

export function CollectionsPanel() {
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [includePublished, setIncludePublished] = useState(true);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [library, setLibrary] = useState<Library | null | undefined>(undefined);
  useEffect(() => { fetch('/api/admin/collections').then(async (response) => {
    if (response.status === 401) { window.location.replace('/login?next=/admin/collections'); return; }
    const payload = await response.json() as { collections?: Collection[]; error?: string };
    if (!response.ok) throw new Error(payload.error || 'Unable to load collections.');
    setCollections(payload.collections ?? []);
  }).catch((reason) => setMessage(reason instanceof Error ? reason.message : 'Unable to load collections.')); }, []);
  async function create(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/admin/collections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, slug, includePublished }) });
      const payload = await response.json() as { collection?: Collection; error?: string };
      if (!response.ok || !payload.collection) throw new Error(payload.error || 'Could not create this collection.');
      setCollections((current) => [payload.collection!, ...(current ?? [])]); setName(''); setSlug(''); setIncludePublished(true); openEditor(payload.collection.id);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Could not create this collection.'); } finally { setSaving(false); }
  }
  const editing = useMemo(() => collections?.find((collection) => collection.id === editingId) ?? null, [collections, editingId]);
  function openEditor(id: string) {
    setEditingId(id); setMessage('');
    const url = new URL(window.location.href); url.searchParams.set('edit', id); window.history.replaceState({}, '', url);
  }
  function closeEditor() {
    setEditingId(null); const url = new URL(window.location.href); url.searchParams.delete('edit'); window.history.replaceState({}, '', url);
  }
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('edit');
    if (id) setEditingId(id);
  }, []);
  useEffect(() => {
    if (!editingId || library !== undefined) return;
    fetch('/api/vimeo/library').then(async (response) => {
      if (response.status === 401) { window.location.replace(`/login?next=/admin/collections?edit=${editingId}`); return; }
      const payload = await response.json() as { library?: Library | null; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Unable to open the work library.');
      setLibrary(payload.library ?? null);
    }).catch((reason) => setMessage(reason instanceof Error ? reason.message : 'Unable to open the work library.'));
  }, [editingId, library]);
  if (editing) return <><div className="collection-editor-actions"><button className="admin-back" type="button" onClick={closeEditor}>← All collections</button><p>Collection selections do not change the films published on Our Work.</p></div>{library === undefined ? <p className="admin-empty">Opening the full Vimeo library…</p> : library ? <CollectionLibraryPicker collection={editing} videos={library.videos} onSaved={(videoIds) => setCollections((current) => current?.map((item) => item.id === editing.id ? { ...item, videoIds } : item) ?? current)} /> : <p className="admin-empty">No Vimeo library yet. <a href="/connect-vimeo">Connect and import Vimeo first.</a></p>}</>;
  return <><div className="collection-admin-grid"><form className="collection-form" onSubmit={create}><p className="eyebrow">New collection</p><h2>A focused edit for the work you want to show.</h2><label><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} placeholder="Automotive stories" /></label><label><span>Share URL</span><div className="collection-slug-input"><i>/</i><input value={slug} onChange={(event) => setSlug(event.target.value)} maxLength={72} placeholder="automotive" /></div></label><label className="collection-checkbox"><input type="checkbox" checked={includePublished} onChange={(event) => setIncludePublished(event.target.checked)} /><span><b>Include all published Our Work videos</b><i>Newly published videos will appear here automatically.</i></span></label><button className="connect-button" disabled={saving}>{saving ? 'Creating…' : 'Create collection'}</button></form><aside className="collection-admin-note"><p className="eyebrow">How it works</p><p>Each collection starts as a focused edit. Add its individual films next, directly from the full Vimeo library.</p></aside></div>{message && <p className="admin-form-error">{message}</p>}<div className="collection-list"><div className="collection-list-head"><p className="eyebrow">Existing collections</p><span>{collections?.length ?? '…'} total</span></div>{collections?.length ? collections.map((collection) => <a href={`/admin/collections?edit=${collection.id}`} onClick={(event) => { event.preventDefault(); openEditor(collection.id); }} key={collection.id}><span><b>{collection.name}</b><i>/{collection.slug}</i></span><span>{collection.includePublished ? 'All published work + ' : ''}{collection.videoIds.length} selected films</span><em>Edit ↗</em></a>) : collections ? <p className="admin-empty">No collections yet. Make the first one above.</p> : <p className="admin-empty">Opening collections…</p>}</div></>;
}
