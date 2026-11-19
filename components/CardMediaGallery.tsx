'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './CardMediaGallery.module.css';
import { useMediaPressHold } from './useMediaPressHold';

type Item = { id: string; title: string; filename: string; contentType: string; tags: string[]; approvedAt: string | null; approvedBy: string | null; url: string };
type Menu = { item: Item; x: number; y: number };
export function CardMediaGallery({ cardId }: { cardId: string }) {
  const endpoint = `/api/admin/production-board/${encodeURIComponent(cardId)}/gallery`;
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const uploading = useRef(false);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [columns, setColumns] = useState(1);
  const galleryRef = useRef<HTMLElement>(null);
  function selectFilter(value: string) { setFilter(value); setPage(0); }
  useEffect(() => {
    const gallery = galleryRef.current;
    if (!gallery) return;
    const measure = () => {
      const css = getComputedStyle(gallery);
      const width = gallery.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
      const minimum = window.matchMedia('(max-width: 540px)').matches ? 90 : 110;
      setColumns(Math.max(1, Math.floor((width + 5) / (minimum + 5))));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(gallery); window.addEventListener('resize', measure); measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [edit, setEdit] = useState<{ item: Item; field: 'title' | 'tags' | 'remove' } | null>(null);
  const [value, setValue] = useState('');
  const [preview, setPreview] = useState<Item | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  async function request(init?: RequestInit) {
    const response = await fetch(endpoint, { cache: 'no-store', ...init });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Unable to save casting changes. Please retry.');
    return result;
  }
  async function load() { const result = await request(); setItems(result.items); }
  useEffect(() => { let active = true; request().then(result => { if (active) setItems(result.items); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [endpoint]);
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const close = () => setMenu(null);
    const outside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) close(); };
    window.addEventListener('pointerdown', outside); window.addEventListener('resize', close); window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); };
  }, [menu]);
  useEffect(() => { if (edit || preview) dialogRef.current?.showModal(); }, [edit, preview]);
  function closeDialog() { setEdit(null); setPreview(null); returnFocus.current?.focus(); }
  function openMenu(item: Item, x: number, y: number, target: HTMLElement) { if (busy) return; returnFocus.current = target; setMenu({ item, x: Math.max(8, Math.min(x, window.innerWidth - 230)), y: Math.max(8, Math.min(y, window.innerHeight - 220)) }); }
  const holdHandlers = useMediaPressHold('[data-casting-preview]', (button, x, y) => {
    const item = items.find(entry => entry.id === button.dataset.castingPreview);
    if (item) openMenu(item, x, y, button);
  }, busy || loading);
  async function change(item: Item, fields: object, method = 'PATCH') {
    setBusy(true); setError('');
    try { await request({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, ...fields }) }); await load(); closeDialog(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save.'); }
    finally { setBusy(false); }
  }
  async function upload(files: File[]) {
    if (busy || loading || uploading.current || !files.length) return;
    uploading.current = true;
    selectFilter('');
    setBusy(true); setError(''); const failures: string[] = [];
    for (const [index, file] of files.entries()) {
      setProgress(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
      try {
        if (file.size > 90 * 1024 * 1024) throw new Error('Maximum file size is 90 MB.');
        await request({ method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name), 'X-File-Size': String(file.size) }, body: file });
      } catch (e) { failures.push(`${file.name}: ${e instanceof Error ? e.message : 'Upload failed.'}`); }
    }
    try { await load(); } catch { failures.push('Unable to refresh casting. Refresh this card to see uploaded files.'); }
    setError(failures.join(' ')); setProgress(''); setBusy(false); uploading.current = false; if (fileInput.current) fileInput.current.value = '';
  }
  const tags = [...new Set(items.flatMap(item => item.tags))].sort();
  const shown = items.filter(item => !filter || item.tags.includes(filter));
  const pageSize = columns * 2;
  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = shown.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  useEffect(() => { setPage(0); }, [columns]);
  useEffect(() => { setPage(previous => Math.min(previous, pageCount - 1)); }, [pageCount]);
  function goToPage(next: number) { setMenu(null); setPage(Math.max(0, Math.min(next, pageCount - 1))); }
  return <section ref={galleryRef} className={`${styles.gallery} ${dragging ? styles.dragging : ''}`} aria-label="Casting" aria-busy={busy || loading}
    onDragEnter={event => {
      if (!event.dataTransfer.types.includes('Files')) return;
      event.preventDefault(); event.stopPropagation();
      dragDepth.current += 1;
      if (!busy && !loading) setDragging(true);
    }}
    onDragOver={event => {
      if (!event.dataTransfer.types.includes('Files')) return;
      event.preventDefault(); event.stopPropagation();
      event.dataTransfer.dropEffect = busy || loading ? 'none' : 'copy';
    }}
    onDragLeave={event => {
      event.preventDefault(); event.stopPropagation();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    }}
    onDrop={event => {
      event.preventDefault(); event.stopPropagation();
      dragDepth.current = 0; setDragging(false);
      if (busy || loading) return;
      const files = Array.from(event.dataTransfer.files);
      if (files.length) void upload(files);
    }}>
    {dragging && <div className={styles.dropOverlay} role="status">Drop photos and videos to upload</div>}
    <div className={styles.heading}><h2>Casting <span>{items.length}</span></h2><button type="button" disabled={busy || loading} onClick={() => fileInput.current?.click()}>+ Upload</button></div>
    <input ref={fileInput} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime" onChange={event => { if (event.target.files?.length) void upload(Array.from(event.target.files)); }} />
    <p className={styles.hint} title="Drop photos or videos anywhere here. Right-click to edit names, tags, or approval. Maximum 90 MB per file.">Drop media · Right-click or hold to edit</p>
    {tags.length > 0 && <div className={styles.filters} aria-label="Filter casting by tag"><button type="button" aria-pressed={!filter} onClick={() => selectFilter('')}>All</button>{tags.map(tag => <button type="button" key={tag} aria-pressed={filter === tag} onClick={() => selectFilter(filter === tag ? '' : tag)}>{tag}</button>)}</div>}
    {error && <p role="alert" className={styles.error}>{error}</p>}{progress && <p role="status">{progress}</p>}
    {loading ? <p role="status">Loading casting…</p> : !items.length ? <div className={styles.empty}>Drop photos and audition videos here.<br /><span>Give each a name, tag its role, and approve your selections.</span></div> : !shown.length ? <p>No media with this tag. <button type="button" onClick={() => selectFilter('')}>Show all</button></p> : <div {...holdHandlers} className={styles.grid} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, ...(pageCount > 1 ? { aspectRatio: `${columns} / 2`, gridTemplateRows: 'repeat(2, minmax(0, 1fr))' } : {}) }}>{pageItems.map(item => <article key={item.id} className={`${styles.item} ${item.approvedAt ? styles.approved : ''}`} onContextMenu={event => { event.preventDefault(); openMenu(item, event.clientX, event.clientY, event.currentTarget.querySelector('button')!); }}>
      <button type="button" className={styles.thumbnail} data-casting-preview={item.id} aria-label={`Preview ${item.title}`} onClick={event => { returnFocus.current = event.currentTarget; setPreview(item); }}>{item.contentType.startsWith('video/') ? <><video src={`${item.url}#t=0.1`} preload="metadata" muted playsInline /><span className={styles.videoLabel} aria-label="Video">▶</span></> : <img src={item.url} alt={item.title} loading="lazy" draggable={false} />}</button>
      {item.approvedAt && <span className={styles.badge} title={`Approved by ${item.approvedBy}`} aria-label={`Approved by ${item.approvedBy}`}>✓</span>}
      <div className={styles.info}><div className={styles.caption}><strong title={item.title}>{item.title}</strong></div>
      <div className={styles.tags}>{item.tags.map(tag => <button type="button" key={tag} onClick={() => selectFilter(tag)}>{tag}</button>)}</div></div>
    </article>)}</div>}
    {pageCount > 1 && <nav className={styles.pagination} aria-label="Casting pages">
      <button type="button" className={styles.pageArrow} aria-label="Previous casting page" disabled={currentPage === 0} onClick={() => goToPage(currentPage - 1)}>‹</button>
      <div className={styles.pageDots}>{Array.from({ length: pageCount }, (_, index) => <button type="button" key={index} className={styles.pageDot} aria-label={`Casting page ${index + 1} of ${pageCount}`} aria-current={index === currentPage ? 'page' : undefined} title={`Page ${index + 1}`} onClick={() => goToPage(index)}><span /></button>)}</div>
      <button type="button" className={styles.pageArrow} aria-label="Next casting page" disabled={currentPage === pageCount - 1} onClick={() => goToPage(currentPage + 1)}>›</button>
      <span className={styles.pageStatus} role="status">Page {currentPage + 1} of {pageCount}</span>
    </nav>}
    {menu && createPortal(<div ref={menuRef} role="menu" aria-label={`Actions for ${menu.item.title}`} className={styles.menu} style={{ left: menu.x, top: menu.y }} onKeyDown={event => {
      if (event.key === 'Escape' || event.key === 'Tab') { event.stopPropagation(); setMenu(null); returnFocus.current?.focus(); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const buttons = Array.from(event.currentTarget.querySelectorAll('button')); const index = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
    }}>
      <button type="button" role="menuitem" onClick={() => { setEdit({ item: menu.item, field: 'title' }); setValue(menu.item.title); setMenu(null); }}>Edit title / name</button>
      <button type="button" role="menuitem" onClick={() => { setEdit({ item: menu.item, field: 'tags' }); setValue(menu.item.tags.join(', ')); setMenu(null); }}>Edit tags</button>
      <button type="button" role="menuitem" onClick={() => { void change(menu.item, { approved: !menu.item.approvedAt }); setMenu(null); }}>{menu.item.approvedAt ? 'Remove approval' : '✓ Approve'}</button>
      <button type="button" role="menuitem" onClick={() => { setEdit({ item: menu.item, field: 'remove' }); setMenu(null); }}>Remove from casting</button>
    </div>, document.body)}
    {(edit || preview) && createPortal(<dialog ref={dialogRef} className={styles.dialog} aria-label={preview ? preview.title : edit?.field === 'tags' ? 'Edit tags' : edit?.field === 'remove' ? 'Remove media' : 'Edit title'} onCancel={event => { event.stopPropagation(); if (busy) event.preventDefault(); else closeDialog(); }} onClick={event => { if (event.target === event.currentTarget && !busy) closeDialog(); }}>
      {preview ? <><div className={styles.heading}><h3>{preview.title}</h3><button type="button" onClick={closeDialog}>Close ×</button></div>{preview.contentType.startsWith('video/') ? <video src={preview.url} controls playsInline autoPlay={false} /> : <img src={preview.url} alt={preview.title} />}<a href={preview.url} target="_blank" rel="noreferrer">Open original file</a></> : edit && <form onSubmit={event => { event.preventDefault(); void change(edit.item, edit.field === 'title' ? { title: value } : edit.field === 'tags' ? { tags: value.split(',').map(t => t.trim()).filter(Boolean) } : {}, edit.field === 'remove' ? 'DELETE' : 'PATCH'); }}>
      <h3>{edit.field === 'title' ? 'Title / name' : edit.field === 'tags' ? 'Tags' : 'Remove from casting?'}</h3>
      {edit.field === 'remove' ? <p>Remove “{edit.item.title}” from this card’s casting section?</p> : <label>{edit.field === 'tags' ? 'Separate tags with commas, for example: mom, teacher' : 'Name this photo or video'}<input autoFocus value={value} maxLength={edit.field === 'title' ? 180 : 1020} required={edit.field === 'title'} onChange={event => setValue(event.target.value)} list={edit.field === 'tags' ? 'gallery-tag-options' : undefined} /></label>}
      <datalist id="gallery-tag-options">{tags.map(tag => <option key={tag} value={tag} />)}</datalist>
      {error && <p role="alert" className={styles.error}>{error}</p>}<div className={styles.actions}><button type="button" disabled={busy} onClick={closeDialog}>Cancel</button><button type="submit" disabled={busy}>{busy ? 'Saving…' : edit.field === 'remove' ? 'Remove' : 'Save'}</button></div></form>}
    </dialog>, document.body)}
  </section>;
}
