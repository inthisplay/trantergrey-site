'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { VimeoLibraryVideo } from '@/lib/vimeo-library';

type Status = VimeoLibraryVideo['libraryStatus'];
type PickerState = { video: VimeoLibraryVideo; left: number; top: number };

const tagKey = (tag: string) => tag.trim().toLocaleLowerCase();

export function VimeoLibraryReview({ videos, clients, localTags }: { videos: VimeoLibraryVideo[]; clients: string[]; localTags: string[] }) {
  const [items, setItems] = useState(videos);
  const [availableClients, setAvailableClients] = useState(clients);
  const [availableTags, setAvailableTags] = useState(localTags);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [clientPicker, setClientPicker] = useState<PickerState | null>(null);
  const [clientQuery, setClientQuery] = useState('');
  const [tagPicker, setTagPicker] = useState<PickerState | null>(null);
  const [tagQuery, setTagQuery] = useState('');
  const clientPickerRef = useRef<HTMLDivElement>(null);
  const tagPickerRef = useRef<HTMLDivElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setItems(videos); setEditingTitle(null); setClientPicker(null); setTagPicker(null); }, [videos]);
  useEffect(() => { setAvailableClients(clients); }, [clients]);
  useEffect(() => { setAvailableTags(localTags); }, [localTags]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setClientPicker(null); setTagPicker(null); } };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);
  useEffect(() => {
    if (!clientPicker) return;
    const closeOutsidePicker = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!clientPickerRef.current?.contains(target) && !target.closest('.client-button')) setClientPicker(null);
    };
    document.addEventListener('pointerdown', closeOutsidePicker);
    return () => document.removeEventListener('pointerdown', closeOutsidePicker);
  }, [clientPicker]);
  useEffect(() => {
    if (!tagPicker) return;
    const closeOutsidePicker = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!tagPickerRef.current?.contains(target) && !target.closest('.tag-button')) setTagPicker(null);
    };
    document.addEventListener('pointerdown', closeOutsidePicker);
    return () => document.removeEventListener('pointerdown', closeOutsidePicker);
  }, [tagPicker]);
  useEffect(() => {
    if (!tagPicker) return;
    const frame = window.requestAnimationFrame(() => tagInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [tagPicker]);

  function pickerPosition(button: HTMLButtonElement) {
    const bounds = button.getBoundingClientRect();
    const width = Math.min(340, window.innerWidth - 24);
    return { left: Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12)), top: Math.max(12, Math.min(bounds.bottom + 8, window.innerHeight - 390)) };
  }

  function openClientPicker(video: VimeoLibraryVideo, button: HTMLButtonElement) {
    setClientPicker({ video, ...pickerPosition(button) });
    setTagPicker(null);
    setClientQuery('');
  }

  function openTagPicker(video: VimeoLibraryVideo, button: HTMLButtonElement) {
    setTagPicker({ video, ...pickerPosition(button) });
    setClientPicker(null);
    setTagQuery('');
  }

  async function saveTitle(id: string) {
    const title = titleDraft.trim();
    setSaving(id);
    const before = items;
    setItems((current) => current.map((item) => item.id === id ? { ...item, customTitle: title || null } : item));
    try {
      const response = await fetch('/api/vimeo/library/title', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, title }) });
      if (!response.ok) throw new Error('Save failed');
      setEditingTitle(null);
    } catch { setItems(before); window.alert('This title could not be saved.'); } finally { setSaving(null); }
  }

  async function assignClient(video: VimeoLibraryVideo, value: string) {
    const client = value.trim();
    setSaving(video.id);
    const before = items;
    setItems((current) => current.map((item) => item.id === video.id ? { ...item, client: client || null } : item));
    try {
      const response = await fetch('/api/vimeo/library/client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: video.id, client }) });
      if (!response.ok) throw new Error('Save failed');
      if (client) setAvailableClients((current) => [...new Set([...current, client])].sort((a, b) => a.localeCompare(b)));
      setClientPicker(null);
    } catch { setItems(before); window.alert('This client could not be saved.'); } finally { setSaving(null); }
  }

  async function removeClient(client: string) {
    if (!window.confirm(`Remove “${client}” from the client list? This also clears the client assignment from every video using it.`)) return;
    setSaving(`client:${client}`);
    const beforeItems = items;
    const beforeClients = availableClients;
    setItems((current) => current.map((item) => item.client === client ? { ...item, client: null } : item));
    setAvailableClients((current) => current.filter((name) => name !== client));
    try {
      const response = await fetch('/api/vimeo/library/client/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client }) });
      if (!response.ok) throw new Error('Delete failed');
    } catch { setItems(beforeItems); setAvailableClients(beforeClients); window.alert('This client could not be deleted.'); } finally { setSaving(null); }
  }

  async function saveLocalTags(video: VimeoLibraryVideo, tags: string[]) {
    const nextTags = tags.map((tag) => tag.trim().replace(/\s+/g, ' ')).filter(Boolean).filter((tag, index, all) => all.findIndex((item) => tagKey(item) === tagKey(tag)) === index).slice(0, 24);
    setSaving(video.id);
    const before = items;
    setItems((current) => current.map((item) => item.id === video.id ? { ...item, localTags: nextTags } : item));
    setTagPicker((current) => current?.video.id === video.id ? { ...current, video: { ...current.video, localTags: nextTags } } : current);
    try {
      const response = await fetch('/api/vimeo/library/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: video.id, tags: nextTags }) });
      if (!response.ok) throw new Error('Save failed');
      setAvailableTags((current) => [...new Set([...current, ...nextTags])].sort((a, b) => a.localeCompare(b)));
    } catch {
      setItems(before);
      setTagPicker((current) => current?.video.id === video.id ? { ...current, video } : current);
      window.alert('These tags could not be saved.');
    } finally { setSaving(null); }
  }

  function addTagFromQuery() {
    if (!tagPicker || !tagQuery.trim() || exactTag) return;
    saveLocalTags(tagPicker.video, [...(tagPicker.video.localTags ?? []), tagQuery]);
    setTagQuery('');
  }

  async function changeStatus(id: string, status: Status) {
    setSaving(id);
    const before = items;
    setItems((current) => current.map((item) => item.id === id ? { ...item, libraryStatus: status } : item));
    try {
      const response = await fetch('/api/vimeo/library/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
      if (!response.ok) throw new Error('Save failed');
    } catch { setItems(before); window.alert('This change could not be saved.'); } finally { setSaving(null); }
  }

  const matchingClients = useMemo(() => availableClients.filter((client) => client.toLowerCase().includes(clientQuery.trim().toLowerCase())), [availableClients, clientQuery]);
  const exactClient = availableClients.some((client) => client.toLowerCase() === clientQuery.trim().toLowerCase());
  const matchingTags = useMemo(() => availableTags.filter((tag) => tag.toLowerCase().includes(tagQuery.trim().toLowerCase())).slice(0, 20), [availableTags, tagQuery]);
  const exactTag = availableTags.some((tag) => tagKey(tag) === tagKey(tagQuery));
  const unassignedMatchingTags = tagPicker ? matchingTags.filter((tag) => !(tagPicker.video.localTags ?? []).some((assigned) => tagKey(assigned) === tagKey(tag))) : [];

  return <>
    <div className="curation-grid">{items.map((video) => <article className="curation-card" key={video.id}>
      <a className="curation-thumb" href={video.url || `https://vimeo.com/${video.id}`} target="_blank" rel="noreferrer">{video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" /> : <span>Vimeo</span>}<span>{Math.floor(video.duration / 60)}:{String(video.duration % 60).padStart(2, '0')}</span></a>
      <div className="curation-copy"><p className="curation-status">{video.libraryStatus}</p>{editingTitle === video.id ? <form className="title-editor" onSubmit={(event) => { event.preventDefault(); saveTitle(video.id); }}><input autoFocus value={titleDraft} maxLength={140} onChange={(event) => setTitleDraft(event.target.value)} aria-label="Custom library title" /><div><button disabled={saving === video.id}>Save</button><button type="button" onClick={() => setEditingTitle(null)}>Cancel</button></div></form> : <><h2>{video.customTitle || video.title}</h2><button className="edit-title" onClick={() => { setEditingTitle(video.id); setTitleDraft(video.customTitle ?? video.title); }}>{video.customTitle ? 'Edit title' : 'Customize title'}</button></>}<p className="curation-meta">{video.privacy || 'unknown privacy'} · {video.createdAt ? new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(new Date(video.createdAt)) : 'undated'}</p>{video.customTitle && <p className="vimeo-title">Vimeo: {video.title}</p>}<button className="client-button" onClick={(event) => openClientPicker(video, event.currentTarget)}>{video.client ? `Client · ${video.client}` : '+ Client'}</button><button className="tag-button" onClick={(event) => openTagPicker(video, event.currentTarget)}>{video.localTags?.length ? `Private tags · ${video.localTags.length}` : '+ Private tags'}</button>{video.localTags?.length ? <p className="local-tag-list">{video.localTags.join(' · ')}</p> : null}{video.tags.length > 0 && <p className="vimeo-tags">Vimeo: {video.tags.slice(0, 4).join(' · ')}</p>}</div>
      <div className="curation-actions"><button className={video.libraryStatus === 'published' ? 'active' : ''} onClick={() => changeStatus(video.id, 'published')} disabled={saving === video.id}>Publish</button><button className={video.libraryStatus === 'hidden' ? 'active' : ''} onClick={() => changeStatus(video.id, 'hidden')} disabled={saving === video.id}>Hide</button><button className={video.libraryStatus === 'unreviewed' ? 'active' : ''} onClick={() => changeStatus(video.id, 'unreviewed')} disabled={saving === video.id}>Reset</button></div>
    </article>)}</div>
    {clientPicker && <div ref={clientPickerRef} className="client-picker-popover" role="dialog" aria-label="Assign a client" style={{ left: clientPicker.left, top: clientPicker.top }}><div className="client-picker-popover-head"><span>Assign client</span><button onClick={() => setClientPicker(null)} aria-label="Close client picker">×</button></div><label><span>Find or add a client</span><input autoFocus value={clientQuery} placeholder="Start typing a client name" onChange={(event) => setClientQuery(event.target.value)} /></label><div className="client-picker-list">{matchingClients.length ? matchingClients.map((client) => <div className="client-picker-row" key={client}><button onClick={() => assignClient(clientPicker.video, client)} disabled={saving === clientPicker.video.id}><span>{client}</span>{clientPicker.video.client === client && <i>Current</i>}</button><button className="delete-client" title={`Delete ${client}`} aria-label={`Delete ${client}`} onClick={() => removeClient(client)} disabled={saving === `client:${client}`}>×</button></div>) : <p>{availableClients.length ? 'No matching clients.' : 'No clients saved yet.'}</p>}</div>{clientQuery.trim() && !exactClient && <button className="add-client" onClick={() => assignClient(clientPicker.video, clientQuery)} disabled={saving === clientPicker.video.id}>+ Add “{clientQuery.trim()}”</button>}{clientPicker.video.client && <button className="clear-client" onClick={() => assignClient(clientPicker.video, '')} disabled={saving === clientPicker.video.id}>Remove client</button>}</div>}
    {tagPicker && <div ref={tagPickerRef} className="tag-picker-popover" role="dialog" aria-label="Manage private tags" style={{ left: tagPicker.left, top: tagPicker.top }}><div className="tag-picker-popover-head"><span>Private tags</span><button onClick={() => setTagPicker(null)} aria-label="Close tag picker">×</button></div><label><span>Find or add a private tag</span><input ref={tagInputRef} autoFocus value={tagQuery} placeholder="e.g. Automotive, Comedy, Testimonials" onChange={(event) => setTagQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && tagQuery.trim() && !exactTag && unassignedMatchingTags.length === 0) { event.preventDefault(); addTagFromQuery(); } }} /></label>{tagPicker.video.localTags?.length ? <div className="assigned-tag-list">{tagPicker.video.localTags.map((tag) => <button key={tag} onClick={() => saveLocalTags(tagPicker.video, (tagPicker.video.localTags ?? []).filter((item) => tagKey(item) !== tagKey(tag)))} disabled={saving === tagPicker.video.id}>{tag} <span>×</span></button>)}</div> : <p className="tag-picker-empty">No private tags yet.</p>}<div className="tag-picker-list">{unassignedMatchingTags.length ? unassignedMatchingTags.map((tag) => <button key={tag} onClick={() => { saveLocalTags(tagPicker.video, [...(tagPicker.video.localTags ?? []), tag]); setTagQuery(''); }} disabled={saving === tagPicker.video.id}>+ {tag}</button>) : <p>{availableTags.length ? 'No other matching tags.' : 'No saved private tags yet.'}</p>}</div>{tagQuery.trim() && !exactTag && <button className="add-tag" onClick={addTagFromQuery} disabled={saving === tagPicker.video.id}>+ Add “{tagQuery.trim()}”</button>}<p className="private-tag-note">Private to this library. Never sent to Vimeo or shown on the public work page.</p></div>}
  </>;
}
