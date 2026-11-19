'use client';

import { mediaVariantUrl, mediaPosterUrl } from '@/lib/media-preview';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Descendant } from 'slate';
import { useMediaPressHold } from './useMediaPressHold';

type Preview = { url: string; kind: 'image' | 'video' | 'iframe'; label: string };

type Decision = { url: string; decision: 'highlight' | 'reject'; decidedBy: string; decidedAt: string };

function galleryMarkup(html: string, decisions: Decision[]) {
  if (typeof document === 'undefined') return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  const selector = 'figure.production-comment-upload, figure.production-imported-attachment';
  const isMedia = (node: Element) => node.matches(selector) && Boolean(node.querySelector('img,video'));
  function tile(source: Element) {
    const media = source.matches('iframe') ? source : source.querySelector('img,video');
    if (!media) return source;
    const url = media.getAttribute('src') || '';
    const kind = media.tagName.toLowerCase();
    const label = source.querySelector('figcaption')?.textContent?.trim() || media.getAttribute('alt') || media.getAttribute('title') || (kind === 'img' ? 'Photo' : 'Video');
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'comment-media-tile';
    button.dataset.mediaUrl = url;
    button.dataset.mediaKind = kind === 'img' ? 'image' : kind;
    button.dataset.mediaLabel = label;
    const decision = decisions.find(item => item.url === url);
    button.setAttribute('aria-label', `Preview ${label}${decision ? ` — ${decision.decision === 'highlight' ? 'Highlighted' : 'Rejected'}` : ''}`);
    button.title = decision ? `${label} · ${decision.decision === 'highlight' ? 'Highlighted' : 'Rejected'} by ${decision.decidedBy}` : label;
    if (decision) {
      button.dataset.decision = decision.decision;
      const badge = document.createElement('span'); badge.className = 'comment-media-decision'; badge.textContent = decision.decision === 'highlight' ? '★' : '×'; badge.setAttribute('aria-hidden', 'true'); button.append(badge);
    }
    if (kind === 'iframe') {
      const match = url.match(/^https:\/\/player\.mux\.com\/([A-Za-z0-9_-]+)/);
      if (!match) return source;
      const img = document.createElement('img'); img.src = `https://image.mux.com/${match[1]}/thumbnail.jpg?width=320&fit_mode=preserve`; img.alt = ''; img.loading = 'lazy'; button.append(img);
    } else {
      const thumbnail = document.createElement('img');
      thumbnail.src = mediaVariantUrl(url, kind === 'video' ? 'poster' : 'thumb');
      // Remote videos do not support our private poster endpoint.
      if (kind === 'video' && !mediaPosterUrl(url)) thumbnail.removeAttribute('src');
      thumbnail.alt = ''; thumbnail.loading = 'lazy'; thumbnail.draggable = false;
      button.append(thumbnail);
    }
    if (kind !== 'img') { const play = document.createElement('span'); play.className = 'comment-media-play'; play.textContent = '▶'; play.setAttribute('aria-hidden', 'true'); button.append(play); }
    return button;
  }
  // Group adjacent uploads, including the empty paragraphs inserted by the editor.
  const parents = new Set(Array.from(template.content.querySelectorAll(selector)).map(node => node.parentNode!));
  for (const parent of parents) {
    let run: Element[] = [];
    const flush = () => {
      if (run.length > 1) {
        const grid = document.createElement('div'); grid.className = 'comment-media-grid'; grid.setAttribute('aria-label', 'Comment media');
        parent.insertBefore(grid, run[0]);
        for (const node of run) { grid.append(tile(node)); node.remove(); }
      }
      run = [];
    };
    for (const node of Array.from(parent.childNodes)) {
      if (node instanceof Element && isMedia(node)) run.push(node);
      else if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) continue;
      else if (node instanceof Element && node.matches('p') && !node.textContent?.trim() && !node.querySelector('img,video,iframe,input')) continue;
      else flush();
    }
    flush();
  }
  template.content.querySelectorAll<HTMLImageElement>('img:not(.comment-media-tile img)').forEach(img => {
    img.src = mediaVariantUrl(img.getAttribute('src') || '', 'preview'); img.loading = 'lazy';
  });
  template.content.querySelectorAll<HTMLVideoElement>('video').forEach(video => {
    const poster = mediaPosterUrl(video.getAttribute('src') || '');
    if (poster) video.poster = poster;
    video.preload = 'none';
  });
  return template.innerHTML;
}

export function CommentMediaContent({ html, cardId, commentKey, onCopy }: { html: string; cardId: string; commentKey: string; onCopy: (block: Descendant) => void }) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const markup = useMemo(() => galleryMarkup(html, decisions), [html, decisions]);
  const hasGallery = markup.includes('comment-media-tile');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [menu, setMenu] = useState<{ media: Preview; x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const endpoint = `/api/admin/production-board/${encodeURIComponent(cardId)}/comment-media`;
  useEffect(() => {
    if (!hasGallery) return;
    let active = true;
    fetch(`${endpoint}?comment=${encodeURIComponent(commentKey)}`, { cache: 'no-store' }).then(async response => {
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Unable to load media decisions.');
      if (active) { setDecisions(payload.decisions); setError(''); }
    }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [endpoint, commentKey, html, hasGallery]);
  useEffect(() => { if (preview) dialog.current?.showModal(); }, [preview]);
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(null); };
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', outside); window.addEventListener('resize', close); window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); };
  }, [menu]);
  const close = () => { dialog.current?.close(); setPreview(null); trigger.current?.focus(); };
  const readMedia = (button: HTMLButtonElement): Preview => ({ url: button.dataset.mediaUrl!, kind: button.dataset.mediaKind as Preview['kind'], label: button.dataset.mediaLabel! });
  function openMenu(button: HTMLButtonElement, x: number, y: number) {
    if (busy) return;
    trigger.current = button; setError(''); setNotice('');
    setMenu({ media: readMedia(button), x: Math.max(8, Math.min(x, window.innerWidth - 240)), y: Math.max(8, Math.min(y, window.innerHeight - 155)) });
  }
  const holdHandlers = useMediaPressHold('button[data-media-url]', (button, x, y) => openMenu(button as HTMLButtonElement, x, y), busy);
  async function action(choice: 'highlight' | 'reject' | 'copy') {
    if (!menu || busy) return;
    const media = menu.media;
    setBusy(true); setError(''); setMenu(null);
    const existing = decisions.find(entry => entry.url === media.url);
    try {
      const response = await fetch(endpoint, { method: choice === 'copy' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commentKey, url: media.url, ...(choice === 'copy' ? { action: 'copy' } : { decision: existing?.decision === choice ? null : choice }) }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Unable to update media.');
      if (choice === 'copy') { onCopy(payload.block); setNotice('Media added to the new comment draft.'); }
      else { setDecisions(current => [...current.filter(entry => entry.url !== media.url), ...(payload.decision ? [payload.decision] : [])]); setNotice(payload.decision ? `${choice === 'highlight' ? 'Highlighted' : 'Rejected'} ${media.label}.` : 'Decision cleared.'); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update media.'); }
    finally { setBusy(false); }
  }
  return <><div {...holdHandlers} onClick={event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-media-url]');
    if (!button) return;
    event.stopPropagation(); trigger.current = button; setPreview(readMedia(button));
  }} onContextMenu={event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-media-url]');
    if (!button) return;
    event.preventDefault(); event.stopPropagation(); openMenu(button, event.clientX, event.clientY);
  }} onKeyDown={event => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-media-url]');
    if (!button) return;
    event.preventDefault(); event.stopPropagation(); const rect = button.getBoundingClientRect(); openMenu(button, rect.left, rect.bottom);
  }} dangerouslySetInnerHTML={{ __html: markup }} />
  {error && <p role="alert" className="production-save-error">{error}</p>}
  {notice && <span className="visually-hidden" role="status">{notice}</span>}
  {menu && createPortal(<div ref={menuRef} role="menu" aria-label="Comment media actions" className="comment-media-menu" style={{ left: menu.x, top: menu.y }} onKeyDown={event => {
    if (event.key === 'Escape' || event.key === 'Tab') { event.stopPropagation(); setMenu(null); trigger.current?.focus(); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const buttons = Array.from(event.currentTarget.querySelectorAll('button')); const index = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
  }}>
    <button type="button" role="menuitemcheckbox" aria-checked={decisions.some(entry => entry.url === menu.media.url && entry.decision === 'highlight')} onClick={() => void action('highlight')}>Highlight</button>
    <button type="button" role="menuitemcheckbox" aria-checked={decisions.some(entry => entry.url === menu.media.url && entry.decision === 'reject')} onClick={() => void action('reject')}>Reject</button>
    <button type="button" role="menuitem" onClick={() => void action('copy')}>Copy to new comment</button>
  </div>, document.body)}
  {preview && createPortal(<dialog ref={dialog} className="comment-media-preview" aria-label={preview.label} onCancel={event => { event.preventDefault(); event.stopPropagation(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <button type="button" className="comment-media-close" onClick={close} aria-label="Close media preview">Close ×</button>
    {preview.kind === 'image' ? <img src={mediaVariantUrl(preview.url, 'preview')} alt={preview.label} /> : preview.kind === 'video' ? <video src={preview.url} poster={mediaPosterUrl(preview.url)} preload="none" controls playsInline /> : <iframe src={preview.url} title={preview.label} allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen />}
    <a href={preview.url} target="_blank" rel="noreferrer">Open original file</a>
  </dialog>, document.body)}
  </>;
}
