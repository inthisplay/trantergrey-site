'use client';

import { FormEvent, useEffect, useState } from 'react';

type Collection = { id: string; name: string; slug: string; includePublished: boolean; videoIds: string[] };

export function CollectionsPanel() {
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [includePublished, setIncludePublished] = useState(true);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
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
      setCollections((current) => [payload.collection!, ...(current ?? [])]); setName(''); setSlug(''); setIncludePublished(true); setMessage('Collection created. Video selection will be added in the next migration pass.');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Could not create this collection.'); } finally { setSaving(false); }
  }
  return <><div className="collection-admin-grid"><form className="collection-form" onSubmit={create}><p className="eyebrow">New collection</p><h2>A page for the cuts you only share when it helps.</h2><label><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} placeholder="The director's cut" /></label><label><span>Share URL</span><div className="collection-slug-input"><i>/</i><input value={slug} onChange={(event) => setSlug(event.target.value)} maxLength={72} placeholder="clients/bmw" /></div></label><label className="collection-checkbox"><input type="checkbox" checked={includePublished} onChange={(event) => setIncludePublished(event.target.checked)} /><span><b>Include all published Work videos</b><i>Newly published videos will appear here automatically.</i></span></label><button className="connect-button" disabled={saving}>{saving ? 'Creating…' : 'Create collection'}</button></form><aside className="collection-admin-note"><p className="eyebrow">How it works</p><p>Collections reuse your Vimeo library. They stay unlisted and are separate from the main work page.</p></aside></div>{message && <p className="admin-form-error">{message}</p>}<div className="collection-list"><div className="collection-list-head"><p className="eyebrow">Existing collections</p><span>{collections?.length ?? '…'} total</span></div>{collections?.length ? collections.map((collection) => <div key={collection.id}><span><b>{collection.name}</b><i>/{collection.slug}</i></span><span>{collection.includePublished ? 'All published work' : 'Selected videos only'} · {collection.videoIds.length} extras</span></div>) : collections ? <p className="admin-empty">No private collections yet. Make the first one above.</p> : <p className="admin-empty">Opening collections…</p>}</div></>;
}
