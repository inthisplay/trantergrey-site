'use client';

import { suggestCommentDates } from '@/lib/comment-signal';
import { filmingDates } from '@/lib/filming-dates';
import { NotesDatePrompts } from './NotesDatePrompts';
import { CardSignalEditor } from './CardSignalEditor';
import { uiIconMarkup } from '@/lib/ui-icons';
import { UiIcon } from '@/components/UiIcon';

import { useRetryId } from './useRetryId';
import { useLiveRefresh } from './useLiveRefresh';
import { useEffect, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import type { Descendant } from 'slate';
import { ProductionCommentEditor } from './ProductionCommentEditor';
import { ProductionNotesEditor } from './ProductionNotesEditor';
import { ClientPicker } from './ClientPicker';
import { TeamMemberPicker } from './TeamMemberPicker';
import { CardMediaGallery } from './CardMediaGallery';
import { CommentMediaContent } from './CommentMediaContent';
import { ProductionCardTitle } from './ProductionCardTitle';
import { docxHtmlToCommentValue, docxToHtml } from '@/lib/docx-to-html';

type Column = { sourceId: string; name: string };
type LocalComment = { id: string; isQuestion?: number; questionResolvedAt?: string | null; bodyHtml: string; bodyJson?: string; authorName: string; authorEmail?: string | null; createdAt: string; deletedAt?: string | null; deletedByName?: string | null };
type Detail = {
  card: Record<string, unknown>;
  steps: Array<Record<string, unknown>>;
  comments: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  attachments: Array<{ sourceId: string; filename: string; status: string }>;
  columns: Column[];
  clients: string[];
  assignees: string[];
  localComments: LocalComment[];
  editLog: Array<{ changedAt: string }>;
  viewer: { name: string; email: string | null } | null;
};
type Draft = { expectedUpdatedAt: string; title: string; notes: string; notesHtml?: string; client: string; assignedTo: string; dueOn: string; columnSourceId: string; archived: boolean };
type TimelineItem = { id: string; kind: 'comment' | 'event' | 'local-comment'; timestamp: string; author?: string; html?: string; summary?: string; order: number };

const text = (value: unknown) => typeof value === 'string' ? value : '';
const descriptionText = (html: unknown) => {
  if (typeof html !== 'string') return '';
  if (typeof window === 'undefined') return html.replace(/<[^>]*>/g, '');
  const element = document.createElement('div');
  element.innerHTML = html.replace(/<br\s*\/?>/gi, '\n');
  return element.textContent || '';
};
const names = (value: unknown) => {
  try { const parsed = JSON.parse(text(value)); return Array.isArray(parsed) ? parsed.filter((person): person is string => typeof person === 'string') : []; }
  catch { return []; }
};
const sourceCommentAuthor = (value: unknown) => {
  try { const parsed = JSON.parse(text(value)); return typeof parsed?.name === 'string' ? parsed.name : 'Unknown'; }
  catch { return 'Unknown'; }
};
const hasCommentContent = (value: Descendant[] | null) => Boolean(value?.some((node) => 'type' in node && (node.type === 'mux-asset' || node.type === 'attachment' || node.type === 'comment-media') || ('children' in node && node.children.some((child) => 'text' in child && child.text.trim()))));
// Presentation only: keep saved comment HTML and link destinations intact.
const compactCommentLinks = (html: string) => {
  if (typeof document === 'undefined') return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
    const label = (link.textContent || '').trim();
    if (label.length <= 35 || !/^(?:https?:\/\/|www\.)\S+$/i.test(label) || link.querySelector('img, video, svg')) return;
    link.textContent = `${label.slice(0, 35)}…`;
    link.title = link.getAttribute('href') || label;
    link.setAttribute('aria-label', label);
  });
  return template.innerHTML;
};
const addMissingMuxCopyButton = (html: string) => html.replace(
  /(<a class="production-comment-mux-asset-public-link" href="([^"]+)"[^>]*>[^<]*<\/a>)(?!<button\b)/g,
  (_, link: string, href: string) => `<div class="production-comment-mux-actions">${link}<button type="button" data-copy-public-link="${href}">Copy public link</button></div>`,
);
const docxAttachmentUrl = (html: string) => {
  if (typeof document === 'undefined') return null;
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const link of Array.from(template.content.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const href = link.getAttribute('href') || '';
    const label = (link.textContent || '').trim();
    if (!/\.docx(?:$|[?#\s])/i.test(`${label} ${href}`)) continue;
    try {
      const url = new URL(href, window.location.origin);
      if (url.origin === window.location.origin && /^\/api\/admin\/production-board\/attachments\/[A-Za-z0-9-]+$/.test(url.pathname)) return url.href;
    } catch { /* Ignore malformed attachment links. */ }
  }
  return null;
};

type ProductionCardProps = {
  id: string;
  drawer?: boolean;
  focusTarget?: string;
  onUpdated?: () => void;
  onDeleted?: () => void;
};

export function ProductionCard({ id, drawer = false, focusTarget, onUpdated, onDeleted }: ProductionCardProps) {
  const retryCommentId = useRetryId();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [notesFocused, setNotesFocused] = useState(false);
  const [comment, setComment] = useState<Descendant[] | null>(null);
  const [commentEditorKey, setCommentEditorKey] = useState(0);
  const [commentSaving, setCommentSaving] = useState(false);
  const [tagText, setTagText] = useState('');
  const [dateMeanings, setDateMeanings] = useState<Record<string, string>>({});
  const suggestedDates = suggestCommentDates(comment);
  const acceptedDates = suggestedDates.filter(date => dateMeanings[date] === 'filming');
  const dueDate = suggestedDates.find(date => dateMeanings[date] === 'due');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentEdit, setCommentEdit] = useState<Descendant[] | null>(null);
  const [commentChanging, setCommentChanging] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [deletingCard, setDeletingCard] = useState(false);
  const [docxImportingId, setDocxImportingId] = useState<string | null>(null);
  const [docxImportError, setDocxImportError] = useState<{ id: string; message: string } | null>(null);

  const load = (signal?: AbortSignal) => fetch(`/api/admin/production-board/${encodeURIComponent(id)}`, { cache: 'no-store', signal }).then(async (response) => {
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Unable to open this card.');
    return payload as Detail;
  });

  useEffect(() => { load().then(setData).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to open this card.')); }, [id]);
  useEffect(() => {
    if (data && focusTarget) document.getElementById(focusTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [Boolean(data), focusTarget]);
  useLiveRefresh(async signal => { const payload = await load(signal); if (!signal.aborted) setData(payload); }, Boolean(data) && !draft && !saving && !notesFocused && !comment && !editingCommentId && !commentSaving && !commentChanging && !deletingCard && !docxImportingId);
  if (!data) return <p className="admin-empty">{error || 'Opening production card…'}</p>;

  const card = data.card;
  const assigned = names(card.assignees_json);
  const notesText = descriptionText(card.notes_html);
  const hasSavedNotes = Boolean(text(card.notes_html).trim());
  const timeline: TimelineItem[] = [
    ...data.comments.map((sourceComment, order) => ({ id: `comment-${text(sourceComment.source_id)}`, kind: 'comment' as const, timestamp: text(sourceComment.created_at), author: sourceCommentAuthor(sourceComment.author_json), html: text(sourceComment.body_html), order })),
    ...data.events.map((event, order) => ({ id: `event-${text(event.source_id)}`, kind: 'event' as const, timestamp: text(event.occurred_at), summary: text(event.summary) || text(event.event_type), order: data.comments.length + order })),
    ...data.localComments.map((localComment, order) => ({ id: `local-${localComment.id}`, kind: 'local-comment' as const, timestamp: localComment.deletedAt || localComment.createdAt, author: localComment.authorName, html: localComment.bodyHtml, order: data.comments.length + data.events.length + order })),
  ].sort((left, right) => {
    const leftTime = Date.parse(left.timestamp); const rightTime = Date.parse(right.timestamp);
    if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return left.order - right.order;
    if (Number.isNaN(leftTime)) return 1;
    if (Number.isNaN(rightTime)) return -1;
    return leftTime - rightTime || left.order - right.order;
  });
  const cardDraft = (): Draft => ({ expectedUpdatedAt: text(card.updatedAt), title: text(card.title), notes: notesText, client: text(card.client), assignedTo: assigned.join(', '), dueOn: text(card.due_on).slice(0, 10), columnSourceId: text(card.column_source_id), archived: card.archived === 1 });
  const activeDraft = draft || cardDraft();
  const save = async (nextDraft = draft) => {
    if (!nextDraft) return;
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/admin/production-board/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(nextDraft) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save this card.');
      setData(payload); setDraft(null); onUpdated?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save this card.'); }
    finally { setSaving(false); }
  };
  const confirmNoteDate = async (date: string, meaning: 'filming' | 'due') => {
    const url = `/api/admin/production-board/${encodeURIComponent(id)}`;
    const response = await fetch(meaning === 'filming' ? `${url}/signal` : url, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(meaning === 'filming'
        ? { attention: text(card.attention), filmingDates: [date], appendFilmingDates: true }
        : { ...cardDraft(), notesHtml: text(card.notes_html), dueOn: date }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Unable to update this date.');
    if (meaning === 'due') setData(payload);
    else setData(current => current ? { ...current, card: { ...current.card, filmingOn: JSON.stringify([...new Set([...filmingDates(current.card.filmingOn), date])].sort()) } } : current);
    onUpdated?.();
  };
  const editNotes = () => {
    setDraft({ ...cardDraft(), notesHtml: text(card.notes_html) });
    setNotesFocused(true);
  };
  const updateNotesHtml = (notesHtml: string) => setDraft((current) => ({ ...(current || cardDraft()), notesHtml, notes: descriptionText(notesHtml) }));
  const importDocxIntoComment = async (localComment: LocalComment, itemId: string, href: string) => {
    setDocxImportingId(itemId); setDocxImportError(null);
    try {
      const response = await fetch(href, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('The Word attachment could not be downloaded.');
      const importedHtml = await docxToHtml(await response.blob());
      const importedValue = docxHtmlToCommentValue(importedHtml) as Descendant[];
      let existingValue: Descendant[];
      try {
        const parsed: unknown = localComment.bodyJson ? JSON.parse(localComment.bodyJson) : null;
        existingValue = Array.isArray(parsed) ? parsed as Descendant[] : [{ type: 'paragraph', children: [{ text: descriptionText(localComment.bodyHtml) }] } as Descendant];
      } catch {
        existingValue = [{ type: 'paragraph', children: [{ text: descriptionText(localComment.bodyHtml) }] } as Descendant];
      }
      const separator = { type: 'paragraph' as const, children: [{ text: '' }] } as Descendant;
      const nextValue = [...existingValue, separator, ...importedValue];
      setCommentEdit(nextValue);
      setEditingCommentId(localComment.id);
      window.setTimeout(() => {
        const commentElement = document.getElementById(`comment-${itemId}`);
        commentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        commentElement?.querySelector<HTMLElement>('.production-comment-editor')?.focus();
      }, 80);
    } catch (cause) {
      setDocxImportError({ id: itemId, message: cause instanceof Error ? cause.message : 'Unable to import this Word document.' });
    } finally { setDocxImportingId(null); }
  };
  const toggleSavedChecklist = (event: ChangeEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox' || !target.closest('.production-note-checklist')) return;
    if (target.checked) target.setAttribute('checked', '');
    else target.removeAttribute('checked');
    const notesHtml = target.closest('.production-notes-display')?.innerHTML;
    if (typeof notesHtml === 'string') {
      const nextDraft = { ...cardDraft(), notesHtml, notes: descriptionText(notesHtml) };
      setDraft(nextDraft);
      void save(nextDraft);
    }
  };
  const addComment = async () => {
    if (!hasCommentContent(comment)) return;
    setCommentSaving(true); setError('');
    try {
      const response = await fetch(`/api/admin/production-board/${encodeURIComponent(id)}/comments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: retryCommentId({ comment, tagText, acceptedDates, dueDate, commentEditorKey }), body: comment, ...((tagText.trim() || acceptedDates.length || dueDate) ? { signal: { ...(tagText.trim() ? { attention: tagText.trim() } : {}), ...(acceptedDates.length ? { filmingDates: acceptedDates } : {}), ...(dueDate ? { dueOn: dueDate } : {}) } } : {}) }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to add comment.');
      setData({ ...data, card: { ...data.card, ...(dueDate ? { due_on: dueDate } : {}), ...(tagText.trim() ? { attention: tagText.trim() } : {}), ...(acceptedDates.length ? { filmingOn: JSON.stringify([...new Set([...filmingDates(card.filmingOn), ...acceptedDates])].sort()) } : {}), ...(dueDate ? { dueOn: dueDate } : {}) }, localComments: [...data.localComments, payload.localComment] }); setTagText(''); setDateMeanings({}); setComment(null); setCommentEditorKey((value) => value + 1); onUpdated?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to add comment.'); }
    finally { setCommentSaving(false); }
  };
  const setQuestionAddressed = async (commentId: string, addressed: boolean) => {
    setCommentChanging(true);
    try {
      const response = await fetch(`/api/admin/production-board/${encodeURIComponent(id)}/questions`, { method: 'PATCH', headers: { 'content-type':'application/json' }, body: JSON.stringify({ commentId, addressed }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to update question.');
      setData(current => current ? { ...current, localComments: current.localComments.map(item => item.id === commentId ? { ...item, questionResolvedAt: payload.questionResolvedAt } : item) } : current);
      onUpdated?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update question.'); }
    finally { setCommentChanging(false); }
  };
  const editableByViewer = (localComment: LocalComment) => Boolean(data.viewer && (localComment.authorEmail ? data.viewer.email?.toLowerCase() === localComment.authorEmail.toLowerCase() : data.viewer.name === localComment.authorName));
  const editComment = (localComment: LocalComment) => {
    try { setCommentEdit(localComment.bodyJson ? JSON.parse(localComment.bodyJson) as Descendant[] : [{ type: 'paragraph', children: [{ text: descriptionText(localComment.bodyHtml) }] }]); }
    catch { setCommentEdit([{ type: 'paragraph', children: [{ text: descriptionText(localComment.bodyHtml) }] }]); }
    setEditingCommentId(localComment.id);
  };
  const saveComment = async (commentId: string) => {
    if (!hasCommentContent(commentEdit)) return;
    setCommentChanging(true); setError('');
    try {
      const response = await fetch(`/api/admin/production-board/${encodeURIComponent(id)}/comments`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ commentId, body: commentEdit }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Unable to update comment.');
      setData({ ...data, localComments: data.localComments.map((item) => item.id === commentId ? payload.localComment : item) }); setEditingCommentId(null); setCommentEdit(null); onUpdated?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update comment.'); }
    finally { setCommentChanging(false); }
  };
  const deleteComment = async (commentId: string) => {
    if (!window.confirm('Delete this comment?')) return;
    setCommentChanging(true); setDeletingCommentId(commentId); setError('');
    try {
      const response = await fetch(`/api/admin/production-board/${encodeURIComponent(id)}/comments`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ commentId }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Unable to delete comment.');
      setData({ ...data, localComments: data.localComments.map((item) => item.id === commentId ? payload.localComment : item) }); onUpdated?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete comment.'); }
    finally { setCommentChanging(false); setDeletingCommentId(null); }
  };
  const copyEmbeddedPublicLink = (event: MouseEvent<HTMLElement>) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-copy-public-link]');
    const href = button?.dataset.copyPublicLink;
    if (!button || !href) return;
    const label = button.textContent;
    void navigator.clipboard.writeText(new URL(href, window.location.origin).toString()).then(() => {
      button.textContent = 'Copied';
      window.setTimeout(() => { button.textContent = label; }, 1800);
    }).catch(() => {
      button.textContent = 'Copy failed';
      window.setTimeout(() => { button.textContent = label; }, 1800);
    });
  };
  const deleteCard = async () => {
    if (!window.confirm(`Delete “${activeDraft.title}” from The Deck? This cannot be undone.`)) return;
    setDeletingCard(true); setError('');
    try {
      const response = await fetch(`/api/admin/production-board/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to delete this card.');
      onDeleted?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete this card.'); }
    finally { setDeletingCard(false); }
  };
  return <article className={`production-card${drawer ? ' is-drawer-card' : ''}`}>
    <div className="production-card-heading"><div><p className="eyebrow">Local production record · Basecamp source preserved</p><ProductionCardTitle value={activeDraft.title} onChange={title => setDraft({ ...activeDraft, title })} onSave={() => void save()} disabled={saving} /></div></div>
    {error && <p className="production-save-error" role="alert">{error} <button type="button" onClick={() => { if (draft && !window.confirm("Discard your unsaved draft and load the latest card?")) return; void load().then(payload => { setData(payload); setDraft(null); setError(''); }); }}>Reload latest card</button></p>}
    <dl className="production-properties production-inline-properties"><div><dt>Client</dt><dd><ClientPicker value={activeDraft.client} clients={data.clients} onChange={(value) => setDraft({ ...activeDraft, client: value })} onBlur={(client) => void save({ ...activeDraft, client })} disabled={saving} onClientsChanged={() => onUpdated?.()} placeholder="Search or add a client" /></dd></div><div><dt>Assigned to</dt><dd><TeamMemberPicker value={activeDraft.assignedTo} members={data.assignees} onChange={(value) => setDraft({ ...activeDraft, assignedTo: value })} onBlur={() => void save()} disabled={saving} /></dd></div><div><dt>Due on</dt><dd><span className="production-date-field" data-empty={!activeDraft.dueOn}><input aria-label="Due on" type="date" className={activeDraft.dueOn ? undefined : "is-empty"} value={activeDraft.dueOn} onChange={(event) => setDraft({ ...activeDraft, dueOn: event.target.value })} onBlur={() => void save()} disabled={saving} /><span className="production-date-placeholder" aria-hidden="true">Set date</span></span></dd></div><div><dt>Status</dt><dd><select value={activeDraft.columnSourceId} onChange={(event) => { const next = { ...activeDraft, columnSourceId: event.target.value }; setDraft(next); void save(next); }} disabled={saving}>{data.columns.map((column) => <option key={column.sourceId} value={column.sourceId}>{column.name}</option>)}</select></dd></div></dl>
    <section className="production-card-notes production-inline-notes" onClick={(event) => {
      if (notesFocused || saving || !(event.target instanceof Element) || event.target.closest('a, button, input, label, select, textarea, [role="button"]')) return;
      editNotes();
    }}><div className="production-inline-notes-heading"><h2>Notes</h2>{!notesFocused && <button type="button" onClick={editNotes}>{hasSavedNotes ? 'Edit notes' : 'Add notes'}</button>}</div>{!notesFocused ? <div className={`production-notes-display${hasSavedNotes ? '' : ' is-empty'}`} onChange={toggleSavedChecklist} dangerouslySetInnerHTML={{ __html: text(card.notes_html) || '<p>Add notes…</p>' }} /> : <><ProductionNotesEditor key={`${id}-notes-edit`} autoFocus initialHtml={text(draft?.notesHtml ?? card.notes_html)} disabled={saving} onChange={updateNotesHtml} /><div className="production-inline-notes-actions"><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setDraft(null); setNotesFocused(false); }} disabled={saving}>Cancel</button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { void save().finally(() => setNotesFocused(false)); }} disabled={saving}>{saving ? 'Saving…' : 'Save notes'}</button></div></>}{!notesFocused && <NotesDatePrompts key={id} text={notesText} filmingOn={text(card.filmingOn)} dueOn={text(card.due_on).slice(0,10)} disabled={saving || Boolean(draft)} onConfirm={confirmNoteDate} />}</section>
    {data.steps.length > 0 && <section><h2>Checklist</h2><ul>{data.steps.map((step) => <li key={text(step.source_id)}>{step.completed === 1 ? <><UiIcon name="check" /><span className="sr-only">Completed: </span></> : <><UiIcon name="circle" /><span className="sr-only">Incomplete: </span></>}{text(step.title)}</li>)}</ul></section>}
    <div id="card-gallery"><CardMediaGallery key={id} cardId={id} onUpdated={onUpdated} /></div>
    <section id="card-comments" className="production-local-comments"><h2>Comments</h2><CardSignalEditor key={`${id}-${text(card.attention)}-${text(card.filmingOn)}`} id={id} attention={text(card.attention)} filmingOn={text(card.filmingOn)} onSaved={() => { void load().then(setData).catch(cause => setError(String(cause))); onUpdated?.(); }} />{timeline.map((item) => {
      const localComment = item.kind === 'local-comment' ? data.localComments.find((comment) => `local-${comment.id}` === item.id) : null;
      const canEdit = localComment ? editableByViewer(localComment) && !localComment.deletedAt : false;
      const isEditingComment = localComment?.id === editingCommentId;
      const wordDocxUrl = item.kind === 'comment' || item.kind === 'local-comment' ? docxAttachmentUrl(item.html || '') : null;
      return item.kind === 'event' ? <p className="production-activity-event" key={item.id}><small>{item.timestamp || 'Source timestamp unavailable'}</small> {item.summary}</p> : <article id={`comment-${item.id}`} className={localComment?.id === deletingCommentId ? 'is-deleting' : ''} key={item.id} onClick={copyEmbeddedPublicLink}>{localComment?.deletedAt ? <p className="production-comment-deleted"><small>{localComment.deletedAt}</small>{localComment.deletedByName || localComment.authorName} deleted a comment.</p> : <><small><span className="production-comment-author-name">{item.author}</span> · {item.timestamp}</small>{isEditingComment ? <div className="production-comment-edit"><ProductionCommentEditor key={localComment!.id} cardId={id} client={text(card.client) || null} initialValue={commentEdit || undefined} onChange={setCommentEdit} /><div><button type="button" onClick={() => { setEditingCommentId(null); setCommentEdit(null); }} disabled={commentChanging}>Cancel</button><button type="button" onClick={() => saveComment(localComment!.id)} disabled={commentChanging || !hasCommentContent(commentEdit)}>{commentChanging ? 'Saving…' : 'Save comment'}</button></div></div> : <><CommentMediaContent key={`${id}-${item.id}`} cardId={id} commentKey={item.id} onCopy={block => { setComment(current => [...(current || []), block, { type: 'paragraph', children: [{ text: '' }] }]); setCommentEditorKey(value => value + 1); window.setTimeout(() => document.querySelector('.production-comment-form')?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 0); }} html={addMissingMuxCopyButton(compactCommentLinks(item.html || '')).replace(/(class="production-comment-mux-asset-public-link"[^>]*>Open public page) ↗(?=<\/a>)/g, (_, label: string) => label + ' ' + uiIconMarkup('external'))} />{(Boolean(localComment?.isQuestion) || Boolean(wordDocxUrl && canEdit)) && <div className="production-comment-actions">{Boolean(localComment?.isQuestion) && <button type="button" disabled={commentChanging} onClick={() => void setQuestionAddressed(localComment!.id, !localComment!.questionResolvedAt)}>{localComment?.questionResolvedAt ? 'Question addressed · Reopen' : 'Mark question addressed'}</button>}{wordDocxUrl && canEdit && <button type="button" onClick={() => void importDocxIntoComment(localComment!, item.id, wordDocxUrl)} disabled={Boolean(docxImportingId) || commentChanging || Boolean(editingCommentId)}>{docxImportingId === item.id ? 'Importing…' : 'Import Word script into this comment'}</button>}{docxImportError?.id === item.id && <span role="alert">{docxImportError.message}</span>}</div>}{canEdit && <div className="production-comment-actions"><button type="button" onClick={() => editComment(localComment!)}>Edit</button><button type="button" onClick={() => deleteComment(localComment!.id)} disabled={commentChanging}>{localComment!.id === deletingCommentId ? 'Deleting…' : 'Delete'}</button></div>}</>}</>}</article>;
    })}<div className="production-comment-form"><div><p className="production-comment-author">{data.viewer?.name || 'Signed-in team member'}</p><ProductionCommentEditor key={commentEditorKey} initialValue={comment || undefined} cardId={id} client={text(card.client) || null} onChange={setComment} renderActions={(uploadButton, uploading) => <><div className="comment-tag-options">{suggestedDates.map(date => <details className="comment-date-prompt" key={date}><summary>{dateMeanings[date] === 'filming' ? 'Filming' : dateMeanings[date] === 'due' ? 'Due date' : dateMeanings[date] === 'reference' ? 'Reference' : 'Date found'} · {date}</summary><div role="group" aria-label={`Meaning of ${date}`} className="comment-date-popover"><strong>What does {date} mean?</strong><small>Dates without a year use the current year. Applied when you post.</small>{[['filming','Filming date'],['due','Due date'],['reference','Just a reference']].map(([value,label]) => <button type="button" key={value} disabled={commentSaving} aria-pressed={dateMeanings[date] === value} onClick={event => { setDateMeanings(current => ({ ...Object.fromEntries(Object.entries(current).filter(([key,meaning]) => key === date || value !== 'due' || meaning !== value)), [date]:value })); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{label}</button>)}</div></details>)}<details><summary>Add a card tag</summary><label>Needs attention<input value={tagText} maxLength={80} placeholder="Casting options provided" onChange={event => setTagText(event.target.value)} disabled={commentSaving} /></label><small>Saved with this comment. Clear it when addressed.</small></details></div><div className="production-comment-submit-actions">{uploadButton}<button type="button" onClick={addComment} disabled={commentSaving || uploading || !hasCommentContent(comment)}>{commentSaving ? 'Posting…' : 'Post comment'}</button></div></>} /></div></div></section>
    <div className="production-card-archive"><button type="button" onClick={() => { const next = { ...activeDraft, archived: !activeDraft.archived }; setDraft(next); void save(next); }} disabled={saving || deletingCard}>{activeDraft.archived ? 'Unarchive card' : 'Archive card'}</button><button type="button" className="production-card-delete" onClick={() => void deleteCard()} disabled={saving || deletingCard}>{deletingCard ? 'Deleting…' : 'Delete card'}</button></div>
  </article>;
}
