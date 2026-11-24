'use client';

import { useEffect, useRef, useState } from 'react';
import { UiIcon } from './UiIcon';

type Card = { id: string; title: string; client: string };
export type UploadDeckVideo = { id: string; title: string; client: string; thumbnailUrl?: string | null; playerUrl?: string | null; duration?: number | null };

export function MuxUploadDeckPicker({ client, videos, onClose, onAdded }: { client: string; videos: UploadDeckVideo[]; onClose: () => void; onAdded: (title: string) => void }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [posting, setPosting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const busy = useRef(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    async function load() {
      try {
        const found: Card[] = [];
        let cursor: string | null = null;
        do {
          const params = new URLSearchParams({ limit: '100' });
          if (client.trim()) params.set('client', client.trim());
          if (cursor) params.set('cursor', cursor);
          const response = await fetch(`/api/internal/v1/cards?${params}`, { cache: 'no-store', signal: controller.signal });
          const payload = await response.json() as { data?: Card[]; meta?: { nextCursor?: string | null }; error?: { message?: string } };
          if (!response.ok) throw new Error(payload.error?.message || 'Unable to load Deck cards.');
          found.push(...(payload.data || []).filter(card => !client.trim() || card.client.trim().toLocaleLowerCase() === client.trim().toLocaleLowerCase()));
          cursor = payload.meta?.nextCursor || null;
        } while (cursor);
        setCards(found);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load Deck cards.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => { controller.abort(); previousFocus?.focus(); };
  }, [client]);
  async function add() {
    if (!selectedId || busy.current || uncertain) return;
    const body = videos.map(video => ({ type: 'mux-asset', assetId: video.id, itemKind: 'video', title: video.title, client: video.client, thumbnailUrl: video.thumbnailUrl, duration: video.duration, href: `/watch/${encodeURIComponent(video.id)}`, media: [{ id: video.id, title: video.title, client: video.client, thumbnailUrl: video.thumbnailUrl, playerUrl: video.playerUrl }], children: [{ text: '' }] }));
    // This is the existing rich-comment endpoint; it is not safe to auto-retry.
    if (JSON.stringify(body).length > 10000) { setError('This batch is too large for one Deck comment. Save the uploads, then add smaller groups from the library.'); return; }
    busy.current = true; setPosting(true); setError('');
    try {
      const response = await fetch(`/api/admin/production-board/${encodeURIComponent(selectedId)}/comments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'The comment could not be confirmed.');
      onAdded(cards.find(card => card.id === selectedId)?.title || 'the Deck card');
    } catch {
      setUncertain(true);
      setError('Could not confirm the comment. Check the Deck card before trying again; it may have been added. Your uploads are unchanged.');
    } finally { setPosting(false); busy.current = false; }
  }
  const matches = cards.filter(card => `${card.title} ${card.client}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className="mux-bulk-modal mux-upload-deck-modal" role="dialog" aria-modal="true" aria-labelledby="upload-deck-heading" onMouseDown={() => !posting && onClose()} onKeyDown={event => {
    if (event.key === 'Escape' && !posting) { event.stopPropagation(); onClose(); }
    if (event.key === 'Tab') {
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input, a[href]'));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}><div onMouseDown={event => event.stopPropagation()}>
    <button ref={closeButton} type="button" className="mux-bulk-modal-close" aria-label="Close Deck picker" disabled={posting} onClick={onClose}><UiIcon name="close" /></button>
    <form className="mux-bulk-simple-form" onSubmit={event => { event.preventDefault(); void add(); }}>
      <h3 id="upload-deck-heading">Add to Deck</h3><small>{client.trim() ? `Cards for ${client}.` : 'All Deck cards.'} Add {videos.length === 1 ? 'this video' : `these ${videos.length} videos`} as one comment.</small>
      <label><span>Search cards</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by title" disabled={posting} /></label>
      {error && <small role="alert">{error}</small>}
      {loading ? <span>Loading cards…</span> : <div className="mux-upload-deck-results">{matches.map(card => <button type="button" key={card.id} disabled={posting || uncertain} aria-pressed={selectedId === card.id} onClick={() => setSelectedId(card.id)}><span>{card.title}</span><small>{card.client || 'No client'}</small></button>)}{!matches.length && <span>No matching cards.</span>}</div>}
      {uncertain && <a href={`/app/deck?card=${encodeURIComponent(selectedId)}`} target="_blank" rel="noreferrer">Check Deck card</a>}
      <button type="submit" disabled={!selectedId || posting || uncertain || loading}>{posting ? 'Adding…' : 'Add as comment'}</button>
    </form>
  </div></div>;
}
