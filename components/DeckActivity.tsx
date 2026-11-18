'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { UiIcon } from './UiIcon';
import type { UiIconName } from '@/lib/ui-icons';
import type { DeckHistoryEvent, DeckHistoryMedia, DeckHistoryPage } from '@/lib/deck-history';
import styles from './DeckActivityPreview.module.css';

const actions: Record<string, string> = {
  card_created: 'created a card', card_updated: 'updated a card', card_moved: 'moved a card', card_reordered: 'reordered a card',
  card_archived: 'archived a card', card_restored: 'restored a card', notes_updated: 'updated the notes', assignment_updated: 'updated the assignees',
  comment_added: 'added a comment', comment_edited: 'edited a comment', comment_deleted: 'deleted a comment', attachment_added: 'uploaded an attachment',
  video_linked: 'linked a video', column_color_changed: 'changed the column color', column_renamed: 'renamed a column', column_archived: 'archived a column', column_sorted: 'sorted a column',
};
function eventIcon(event: DeckHistoryEvent): UiIconName {
  if (event.action.includes('comment')) return 'quote';
  if (event.category === 'moves') return 'forward';
  if (event.action === 'video_linked' || event.media.some(item => item.kind === 'video' || item.kind === 'embed')) return 'play';
  if (event.action === 'card_created') return 'plus';
  return 'edit';
}
function ActivityGrip() {
  return <svg className={styles.tabGrip} viewBox="0 0 12 16" width="12" height="16" fill="currentColor" aria-hidden="true" focusable="false">
    <circle cx="3" cy="3" r="1" /><circle cx="9" cy="3" r="1" /><circle cx="3" cy="8" r="1" /><circle cx="9" cy="8" r="1" /><circle cx="3" cy="13" r="1" /><circle cx="9" cy="13" r="1" />
  </svg>;
}
function MediaPreview({ item }: { item: DeckHistoryMedia }) {
  const [active, setActive] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  if (item.kind === 'file') return <a className={styles.fileLink} href={item.url} target="_blank" rel="noreferrer noopener">{item.title}<UiIcon name="external" /></a>;
  if (item.kind === 'image') return <a className={styles.imageLink} href={item.url} target="_blank" rel="noreferrer noopener"><img src={item.url} alt={item.title} loading="lazy" /></a>;
  return <div className={styles.media}>
    {active ? item.kind === 'embed' ? <iframe src={item.url} title={item.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /> : item.kind === 'audio' ? <audio controls autoPlay preload="none" src={item.url} /> : <video controls autoPlay playsInline preload="none" src={item.url} aria-label={item.title} /> : <button type="button" className={styles.poster} onClick={() => setActive(true)} aria-label={`Play ${item.title}`}><strong>{item.kind === 'audio' ? 'Audio attachment' : item.title}</strong>{item.poster && !posterFailed && <img src={item.poster} alt="" loading="lazy" onError={() => setPosterFailed(true)} />}<span><UiIcon name="play" /></span></button>}
    <div className={styles.caption}><strong>{item.title}</strong><a href={item.url} target="_blank" rel="noreferrer noopener" aria-label={`Open ${item.title}`}><UiIcon name="external" /></a></div>
  </div>;
}
function ActivityMedia({ items }: { items: DeckHistoryMedia[] }) {
  const [expanded, setExpanded] = useState(false);
  const previews = items.filter(item => item.kind !== 'file'), links = items.filter(item => item.kind === 'file');
  return <>{(expanded ? previews : previews.slice(0, 1)).map(item => <MediaPreview item={item} key={item.url} />)}
    {previews.length > 1 && <button type="button" className={styles.moreMedia} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Show fewer previews' : `Show ${previews.length - 1} more ${previews.length === 2 ? 'preview' : 'previews'}`}<UiIcon name={expanded ? 'up' : 'chevronDown'} /></button>}
    {links.map(item => <MediaPreview item={item} key={item.url} />)}</>;
}
const dayKey = (event: DeckHistoryEvent) => event.occurredAt ? new Date(event.occurredAt).toLocaleDateString('en-CA') : 'undated';
const dateLabel = (event: DeckHistoryEvent) => event.occurredAt ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(event.occurredAt)) : 'Date unavailable';
const groupLabel = (event: DeckHistoryEvent) => {
  if (!event.occurredAt) return 'Date unavailable';
  const today = new Date(), yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  const date = new Date(event.occurredAt).toDateString();
  return date === today.toDateString() ? 'Today' : date === yesterday.toDateString() ? 'Yesterday' : dateLabel(event);
};
type CachedPage = DeckHistoryPage & { scrollTop: number };

export function DeckActivity({ open, hidden, onOpen, onClose, onCard }: {
  open: boolean; hidden: boolean; onOpen: () => void; onClose: () => void; onCard: (id: string) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const cache = useRef(new Map<string, CachedPage>());
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const restoreScroll = useRef(false);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState<CachedPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);
  useEffect(() => {
    const button = trigger.current;
    const panel = button?.closest('.production-board-layout')?.querySelector('.production-column');
    if (!button || !panel) return;
    let frame = 0;
    const measure = () => {
      const bounds = panel.getBoundingClientRect();
      const top = Math.max(8, bounds.top);
      const bottom = Math.min(window.innerHeight - 8, bounds.bottom);
      button.style.setProperty('--activity-top', `${top}px`);
      button.style.setProperty('--activity-height', `${Math.max(0, bottom - top)}px`);
      button.style.visibility = bottom - top >= 160 ? 'visible' : 'hidden';
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(panel);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    measure();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [hidden]);

  const load = useCallback(async (refresh = false) => {
    if (!open || busy.current) return;
    const previous = cache.current.get(filter);
    if (!refresh && previous && !previous.nextCursor) return;
    busy.current = true; setLoading(true); setError('');
    const sequence = ++generation.current;
    const abort = new AbortController(); controller.current = abort;
    const query = new URLSearchParams({ filter, limit: '25' });
    if (!refresh && previous?.nextCursor) query.set('cursor', previous.nextCursor);
    try {
      const response = await fetch(`/api/admin/production-board/history?${query}`, { cache: 'no-store', signal: abort.signal });
      if (!response.ok) throw new Error(response.status === 401 ? 'Your session expired. Sign in again to load activity.' : 'Unable to load activity. Please try again.');
      const result = await response.json() as DeckHistoryPage;
      if (generation.current !== sequence) return;
      const existing = refresh ? [] : previous?.events || [];
      const seen = new Set(existing.map(event => event.id));
      const next = { events: [...existing, ...result.events.filter(event => !seen.has(event.id))], nextCursor: result.nextCursor, scrollTop: refresh ? 0 : previous?.scrollTop || 0 };
      cache.current.set(filter, next); setPage(next);
      if (refresh && scroll.current) scroll.current.scrollTop = 0;
    } catch (cause) {
      if (!abort.signal.aborted && generation.current === sequence) setError(cause instanceof Error ? cause.message : 'Unable to load activity.');
    } finally {
      if (generation.current === sequence) { busy.current = false; setLoading(false); }
    }
  }, [filter, open]);
  useEffect(() => {
    if (!open) { dialog.current?.close(); return; }
    dialog.current?.showModal(); closeButton.current?.focus({ preventScroll: true });
    const stored = cache.current.get(filter);
    restoreScroll.current = true;
    setPage(stored || null); setError('');
    if (scroll.current) scroll.current.scrollTop = stored?.scrollTop || 0;
    if (!stored) void load(true);
    return () => { controller.current?.abort(); generation.current++; busy.current = false; setLoading(false); };
  }, [open, filter, load]);
  // Restore after React has painted the cached rows (including returning from a card).
  useEffect(() => {
    if (open && restoreScroll.current && page && page === cache.current.get(filter) && scroll.current) {
      scroll.current.scrollTop = page.scrollTop; restoreScroll.current = false;
    }
  }, [open, filter, page]);
  useEffect(() => {
    if (!open || !page?.nextCursor || loading || error || !sentinel.current) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void load(); }, { root: scroll.current, rootMargin: '160px' });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [open, page?.nextCursor, loading, error, load]);
  const remember = () => { const stored = cache.current.get(filter); if (stored) stored.scrollTop = scroll.current?.scrollTop || 0; };
  const close = () => { remember(); onClose(); };
  const openCard = (id: string) => { remember(); onCard(id); };
  const events = page?.events || [];

  return <>
    {!hidden && <button ref={trigger} type="button" className={styles.tab} onClick={onOpen} aria-label="Activity" title="Open Deck activity" aria-controls="deck-activity-panel" aria-haspopup="dialog" aria-expanded={open}>
      <span className={`${styles.tabLine} ${styles.tabLineTop}`} aria-hidden="true" /><ActivityGrip /><span className={styles.tabLabel}>Activity</span><ActivityGrip /><span className={`${styles.tabLine} ${styles.tabLineBottom}`} aria-hidden="true" />
    </button>}
    <dialog ref={dialog} id="deck-activity-panel" className={styles.drawer} aria-labelledby="deck-activity-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className={styles.shell}>
        <header className={styles.header}><div><span className={styles.eyebrow}>The Deck / History</span><h2 id="deck-activity-title">Activity.</h2></div><button ref={closeButton} type="button" onClick={close} aria-label="Close activity"><UiIcon name="close" /></button></header>
        <div className={styles.historyIntro}>Updates from across the Deck.<button type="button" onClick={() => void load(true)} disabled={loading}>Refresh</button></div>
        <nav className={styles.filters} aria-label="Activity filters">{[['all', 'All'], ['updates', 'Updates'], ['moves', 'Moves'], ['management', 'Columns']].map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => { remember(); setFilter(value); }}>{label}</button>)}</nav>
        <div ref={scroll} className={styles.feed} aria-busy={loading}>
          {open && events.map((event, index) => <div key={event.id}>
            {(index === 0 || dayKey(events[index - 1]) !== dayKey(event)) && <h3 className={styles.day}>{groupLabel(event)}<span>{['Today', 'Yesterday'].includes(groupLabel(event)) ? dateLabel(event) : ''}</span></h3>}
            <article className={styles.event} style={{ '--event-accent': event.columnColor || '#c7dee1' } as CSSProperties}>
              <span className={styles.marker}><UiIcon name={eventIcon(event)} /></span>
              <div className={styles.eventTop}><strong>{event.actor}</strong><time dateTime={event.occurredAt || undefined} title={event.occurredAt || 'The source did not record a timestamp'}>{event.occurredAt ? new Date(event.occurredAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'Undated'}</time></div>
              <p className={styles.action}>{actions[event.action] || 'recorded an update'}</p>
              {event.cardId ? <button type="button" className={styles.cardLink} onClick={() => openCard(event.cardId!)}>{event.cardTitle || 'Production card'}<UiIcon name="chevronRight" /></button> : <strong className={styles.columnTitle}>{event.columnName || 'The Deck'}</strong>}
              {event.summary && <p className={styles.assignment}>{event.summary}</p>}
              {event.changes.map((change, i) => <div className={styles.change} key={i}><span>{change.label}</span><p><del>{change.before}</del><UiIcon name="forward" /><strong>{change.after}</strong></p></div>)}
              {event.redacted ? <p className={styles.assignment}>This comment was deleted. Its content is no longer shown.</p> : <>
                {event.text && <div className={styles.note}><p className={expanded.includes(event.id) ? '' : styles.truncated}>{event.text}</p>{event.text.length > 150 && <button type="button" aria-expanded={expanded.includes(event.id)} onClick={() => setExpanded(current => current.includes(event.id) ? current.filter(id => id !== event.id) : [...current, event.id])}>{expanded.includes(event.id) ? 'Show less' : 'Read more'}<UiIcon name={expanded.includes(event.id) ? 'up' : 'chevronDown'} /></button>}</div>}
                <ActivityMedia items={event.media} />
              </>}
              {event.source === 'Basecamp archive' && <small className={styles.source}>Basecamp archive</small>}
            </article>
          </div>)}
          {error && <div className={styles.error} role="alert">{error}<button type="button" onClick={() => void load(!page)}>Try again</button></div>}
          <div ref={sentinel} className={styles.end}>{loading ? <span role="status">Loading activity…</span> : !error && (page?.nextCursor ? <button type="button" onClick={() => void load()}>Load earlier activity</button> : page ? events.length ? 'You’ve reached the beginning of the recorded history.' : 'No activity to show yet.' : null)}</div>
        </div>
        <footer className={styles.footer}><span className={styles.dot} />Recorded activity · Older history may be incomplete</footer>
      </div>
    </dialog>
  </>;
}
