'use client';

import { useEffect, useRef, useState } from 'react';
import { mediaPosterUrl, mediaVariantUrl } from '@/lib/media-preview';
import { rolodexRequest, type TalentMedia } from '@/lib/rolodex';
import styles from './CastingMediaPreview.module.css';

type CastingItem = { id: string; title: string; url: string; contentType: string; rolodexPersonId?: string | null; rolodexMediaId?: string | null };
type PreviewMedia = Pick<TalentMedia, 'id' | 'title' | 'url' | 'kind' | 'contentType'>;

export function CastingMediaPreview({ item, onClose }: { item: CastingItem; onClose: () => void }) {
  const initial: PreviewMedia = { ...item, id: `casting:${item.id}`, kind: 'upload' };
  const [media, setMedia] = useState<PreviewMedia[]>([initial]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(Boolean(item.rolodexPersonId));
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (!item.rolodexPersonId) return;
    let active = true;
    const controller = new AbortController();
    setLoading(true); setError('');
    rolodexRequest(`?id=${encodeURIComponent(item.rolodexPersonId)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) })
      .then((data: { media: TalentMedia[] }) => {
        if (!active) return;
        // Keep the clicked photo first; the gallery and profile may use different URLs for the same file.
        setMedia([initial, ...data.media.filter(entry => entry.id !== item.rolodexMediaId)]);
      })
      .catch(() => { if (active) setError('Other profile media could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [item.id, item.rolodexPersonId, item.rolodexMediaId, attempt]);
  const current = media[index] || media[0];
  function navigate(offset: number) { setIndex(previous => (previous + offset + media.length) % media.length); }
  return <dialog ref={dialog} className={styles.dialog} aria-label={`${item.title} media preview`}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={event => {
      event.stopPropagation();
      // Preserve native video seeking and volume keyboard controls.
      if ((event.target as HTMLElement).closest('video, iframe')) return;
      if (media.length > 1 && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); navigate(event.key === 'ArrowLeft' ? -1 : 1); }
    }}>
    <div className={styles.content}>
      <header className={styles.header}><div><h3>{item.title}</h3><p>{current.title}</p></div><button autoFocus type="button" onClick={onClose} aria-label="Close media preview">Close ×</button></header>
      <div className={styles.stage}>
        {current.kind === 'mux' ? <iframe key={current.id} src={current.url} title={current.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
          : current.contentType?.startsWith('video/') ? <video key={current.id} src={current.url} poster={mediaPosterUrl(current.url)} preload="none" controls playsInline />
          : <img key={current.id} src={mediaVariantUrl(current.url, 'preview')} alt={current.title} />}
      </div>
      {media.length > 1 && <nav className={styles.navigation} aria-label="Profile media">
        <button type="button" className={styles.arrow} aria-label="Previous media" onClick={() => navigate(-1)}>‹</button>
        <div className={styles.dots}>{media.map((entry, position) => <button key={entry.id} type="button" aria-label={`Show ${entry.title}, ${position + 1} of ${media.length}`} aria-current={position === index ? 'true' : undefined} onClick={() => setIndex(position)}><span /></button>)}</div>
        <button type="button" className={styles.arrow} aria-label="Next media" onClick={() => navigate(1)}>›</button>
      </nav>}
      <footer className={styles.footer}><span role="status">{index + 1} of {media.length}{loading ? ' · Loading profile media…' : ''}</span><a href={current.url} target="_blank" rel="noreferrer">{current.kind === 'mux' ? 'Open video' : 'Open original file'} ↗</a></footer>
      {error && <p role="alert" className={styles.error}>{error} <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button></p>}
    </div>
  </dialog>;
}
