'use client';

import { useMemo, useState } from 'react';
import type { CollectionCandidate } from '@/lib/work-collections';

type Props = {
  collectionId: string;
  initialIds: string[];
  videos: CollectionCandidate[];
};

function label(video: CollectionCandidate) {
  return video.customTitle || video.title;
}

export function CollectionVideoPicker({ collectionId, initialIds, videos }: Props) {
  const [selectedIds, setSelectedIds] = useState(() => new Set(initialIds));
  const [query, setQuery] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const shown = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const sorted = [...videos].sort((a, b) => label(a).localeCompare(label(b)));
    if (!normalized) return sorted.filter((video) => selectedIds.has(video.id)).concat(sorted.filter((video) => !selectedIds.has(video.id))).slice(0, 72);
    return sorted.filter((video) => [label(video), video.client, video.libraryStatus].filter(Boolean).join(' ').toLowerCase().includes(normalized)).slice(0, 72);
  }, [query, selectedIds, videos]);

  async function toggle(id: string) {
    if (savingId) return;
    const wasSelected = selectedIds.has(id);
    const next = new Set(selectedIds);
    if (wasSelected) next.delete(id); else next.add(id);
    setSelectedIds(next);
    setSavingId(id);
    setError('');
    try {
      const response = await fetch(`/api/admin/collections/${collectionId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ videoIds: [...next] }) });
      if (!response.ok) throw new Error();
    } catch {
      setSelectedIds(selectedIds);
      setError('That change could not be saved. Please try again.');
    } finally {
      setSavingId(null);
    }
  }

  return <section className="collection-picker">
    <div className="collection-picker-head"><div><p className="eyebrow">Extra videos</p><h2>Add from the full Vimeo library.</h2><p>These sit alongside anything included through the Published switch above.</p></div><strong>{selectedIds.size} selected</strong></div>
    <label className="collection-picker-search"><span>Find a video</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, client, or status" /></label>
    {error && <p className="collection-picker-error">{error}</p>}
    <div className="collection-picker-list">{shown.map((video) => {
      const selected = selectedIds.has(video.id);
      return <button type="button" className={selected ? 'is-selected' : ''} onClick={() => toggle(video.id)} disabled={Boolean(savingId)} key={video.id}>
        {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" /> : <span className="collection-picker-thumb" />}
        <span><b>{label(video)}</b><i>{[video.client, video.libraryStatus].filter(Boolean).join(' · ') || 'No client'}</i></span><em>{selected ? 'Added' : 'Add'}</em>
      </button>;
    })}</div>
    {!shown.length && <p className="admin-empty">No matching videos. Try a different search.</p>}
  </section>;
}
