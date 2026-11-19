'use client';

import { uiIconMarkup } from '@/lib/ui-icons';
import { UiIcon } from '@/components/UiIcon';

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

type Column = { sourceId: string; name: string };
type LocalComment = { id: string; bodyHtml: string; bodyJson?: string; authorName: string; authorEmail?: string | null; createdAt: string; deletedAt?: string | null; deletedByName?: string | null };
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
type Draft = { title: string; notes: string; notesHtml?: string; client: string; assignedTo: string; dueOn: string; columnSourceId: string; archived: boolean };
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

type ProductionCardProps = {
  id: string;
  drawer?: boolean;
  onUpdated?: () => void;
  onDeleted?: () => void;
};

export function ProductionCard({ id, drawer = false, onUpdated, onDeleted }: ProductionCardProps) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [notesFocused, setNotesFocused] = useState(false);
  const [comment, setComment] = useState<Descendant[] | null>(null);
  const [commentEditorKey, setCommentEditorKey] = useState(0);
  const [commentSaving, setCommentSaving] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentEdit, setCommentEdit] = useState<Descendant[] | null>(null);
  const [commentChanging, setCommentChanging] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [deletingCard, setDeletingCard] = useState(false);

  const load = () => fetch(`/api/admin/production-board/${encodeURIComponent(id)}`, { cache: 'no-store' }).then(async (response) => {
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Unable to open this card.');
    return payload as Detail;
  });

  useEffect(() => { load().then(setData).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to open this card.')); }, [id]);
  useEffect(() => {
    const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('.production-card video'));
    if (!videos.length) return;

    const prime = (video: HTMLVideoElement) => {
      if (video.dataset.deckPreviewPrimed === 'true') return;
      video.dataset.deckPreviewPrimed = 'true';
      const wasMuted = video.muted;
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.preload = 'auto';

      const pauseOnFirstFrame = () => {
        const pause = () => {
          if (!video.paused) video.pause();
          // Muting is only needed for the automatic preview. Restore normal audio
          // before someone intentionally presses Play.
          video.muted = wasMuted;
          video.defaultMuted = wasMuted;
        };
        // Safari is more dependable at retaining a decoded frame after a brief muted play
        // than after seeking an unloaded movie. Audio is restored before user playback.
        void video.play().then(() => window.setTimeout(pause, 140)).catch(() => {
          try { video.currentTime = Math.min(0.12, Number.isFinite(video.duration) ? video.duration : 0.12); }
          catch { /* Leave the browser's normal empty-video state intact. */ }
          video.muted = wasMuted;
          video.defaultMuted = wasMuted;
        });
      };

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) pauseOnFirstFrame();
      else video.addEventListener('loadeddata', pauseOnFirstFrame, { once: true });
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          prime(entry.target as HTMLVideoElement);
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '160px 0px' });
    videos.forEach((video) => observer.observe(video));
    return () => observer.disconnect();
  }, [data, comment]);
  if (error || !data) return <p className="admin-empty">{error || 'Opening production card…'}</p>;

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
  const cardDraft = (): Draft => ({ title: text(card.title), notes: notesText, client: text(card.client), assignedTo: assigned.join(', '), dueOn: text(card.due_on).slice(0, 10), columnSourceId: text(card.column_source_id), archived: card.archived === 1 });
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
  const editNotes = () => {
    setDraft({ ...cardDraft(), notesHtml: text(card.notes_html) });
    setNotesFocused(true);
  };
  const updateNotesHtml = (notesHtml: string) => setDraft((current) => ({ ...(current || cardDraft()), notesHtml, notes: descriptionText(notesHtml) }));
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
      const response = await fetch(`/api/admin/production-board/${encodeURIComponent(id)}/comments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: comment }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to add comment.');
      setData({ ...data, localComments: [...data.localComments, payload.localComment] }); setComment(null); setCommentEditorKey((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to add comment.'); }
    finally { setCommentSaving(false); }
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
      setData({ ...data, localComments: data.localComments.map((item) => item.id === commentId ? payload.localComment : item) }); setEditingCommentId(null); setCommentEdit(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update comment.'); }
    finally { setCommentChanging(false); }
  };
  const deleteComment = async (commentId: string) => {
    if (!window.confirm('Delete this comment?')) return;
    setCommentChanging(true); setDeletingCommentId(commentId); setError('');
    try {
      const response = await fetch(`/api/admin/production-board/${encodeURIComponent(id)}/comments`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ commentId }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Unable to delete comment.');
      setData({ ...data, localComments: data.localComments.map((item) => item.id === commentId ? payload.localComment : item) });
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
    {error && <p className="production-save-error">{error}</p>}
    <dl className="production-properties production-inline-properties"><div><dt>Client</dt><dd><ClientPicker value={activeDraft.client} clients={data.clients} onChange={(value) => setDraft({ ...activeDraft, client: value })} onBlur={() => void save()} disabled={saving} onClientsChanged={() => onUpdated?.()} placeholder="Search or add a client" /></dd></div><div><dt>Assigned to</dt><dd><TeamMemberPicker value={activeDraft.assignedTo} members={data.assignees} onChange={(value) => setDraft({ ...activeDraft, assignedTo: value })} onBlur={() => void save()} disabled={saving} /></dd></div><div><dt>Due on</dt><dd><span className="production-date-field" data-empty={!activeDraft.dueOn}><input aria-label="Due on" type="date" className={activeDraft.dueOn ? undefined : "is-empty"} value={activeDraft.dueOn} onChange={(event) => setDraft({ ...activeDraft, dueOn: event.target.value })} onBlur={() => void save()} disabled={saving} /><span className="production-date-placeholder" aria-hidden="true">Set date</span></span></dd></div><div><dt>Status</dt><dd><select value={activeDraft.columnSourceId} onChange={(event) => { const next = { ...activeDraft, columnSourceId: event.target.value }; setDraft(next); void save(next); }} disabled={saving}>{data.columns.map((column) => <option key={column.sourceId} value={column.sourceId}>{column.name}</option>)}</select></dd></div></dl>
    <section className="production-card-notes production-inline-notes"><div className="production-inline-notes-heading"><h2>Notes</h2>{!notesFocused && <button type="button" onClick={editNotes}>{hasSavedNotes ? 'Edit notes' : 'Add notes'}</button>}</div>{!notesFocused ? <div className={`production-notes-display${hasSavedNotes ? '' : ' is-empty'}`} onChange={toggleSavedChecklist} dangerouslySetInnerHTML={{ __html: text(card.notes_html) || '<p>Add notes…</p>' }} /> : <><ProductionNotesEditor key={`${id}-notes-edit`} initialHtml={text(card.notes_html)} disabled={saving} onChange={updateNotesHtml} /><div className="production-inline-notes-actions"><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setDraft(null); setNotesFocused(false); }} disabled={saving}>Cancel</button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { void save().finally(() => setNotesFocused(false)); }} disabled={saving}>{saving ? 'Saving…' : 'Save notes'}</button></div></>}</section>
    {data.steps.length > 0 && <section><h2>Checklist</h2><ul>{data.steps.map((step) => <li key={text(step.source_id)}>{step.completed === 1 ? <><UiIcon name="check" /><span className="sr-only">Completed: </span></> : <><UiIcon name="circle" /><span className="sr-only">Incomplete: </span></>}{text(step.title)}</li>)}</ul></section>}
    <CardMediaGallery key={id} cardId={id} />
    <section className="production-local-comments"><h2>Comments</h2>{timeline.map((item) => {
      const localComment = item.kind === 'local-comment' ? data.localComments.find((comment) => `local-${comment.id}` === item.id) : null;
      const canEdit = localComment ? editableByViewer(localComment) && !localComment.deletedAt : false;
      const isEditingComment = localComment?.id === editingCommentId;
      return item.kind === 'event' ? <p className="production-activity-event" key={item.id}><small>{item.timestamp || 'Source timestamp unavailable'}</small> {item.summary}</p> : <article className={localComment?.id === deletingCommentId ? 'is-deleting' : ''} key={item.id} onClick={copyEmbeddedPublicLink}>{localComment?.deletedAt ? <p className="production-comment-deleted"><small>{localComment.deletedAt}</small>{localComment.deletedByName || localComment.authorName} deleted a comment.</p> : <><small><span className="production-comment-author-name">{item.author}</span> · {item.timestamp}</small>{isEditingComment ? <div className="production-comment-edit"><ProductionCommentEditor key={localComment!.id} cardId={id} client={text(card.client) || null} initialValue={commentEdit || undefined} onChange={setCommentEdit} /><div><button type="button" onClick={() => { setEditingCommentId(null); setCommentEdit(null); }} disabled={commentChanging}>Cancel</button><button type="button" onClick={() => saveComment(localComment!.id)} disabled={commentChanging || !hasCommentContent(commentEdit)}>{commentChanging ? 'Saving…' : 'Save comment'}</button></div></div> : <><CommentMediaContent key={`${id}-${item.id}`} cardId={id} commentKey={item.id} onCopy={block => { setComment(current => [...(current || []), block, { type: 'paragraph', children: [{ text: '' }] }]); setCommentEditorKey(value => value + 1); window.setTimeout(() => document.querySelector('.production-comment-form')?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 0); }} html={addMissingMuxCopyButton(compactCommentLinks(item.html || '')).replace(/(class="production-comment-mux-asset-public-link"[^>]*>Open public page) ↗(?=<\/a>)/g, (_, label: string) => label + ' ' + uiIconMarkup('external'))} />{canEdit && <div className="production-comment-actions"><button type="button" onClick={() => editComment(localComment!)}>Edit</button><button type="button" onClick={() => deleteComment(localComment!.id)} disabled={commentChanging}>{localComment!.id === deletingCommentId ? 'Deleting…' : 'Delete'}</button></div>}</>}</>}</article>;
    })}<div className="production-comment-form"><div><p className="production-comment-author">{data.viewer?.name || 'Signed-in team member'}</p><ProductionCommentEditor key={commentEditorKey} initialValue={comment || undefined} cardId={id} client={text(card.client) || null} onChange={setComment} renderActions={(uploadButton, uploading) => <div className="production-comment-submit-actions">{uploadButton}<button type="button" onClick={addComment} disabled={commentSaving || uploading || !hasCommentContent(comment)}>{commentSaving ? 'Posting…' : 'Post comment'}</button></div>} /></div></div></section>
    <div className="production-card-archive"><button type="button" onClick={() => { const next = { ...activeDraft, archived: !activeDraft.archived }; setDraft(next); void save(next); }} disabled={saving || deletingCard}>{activeDraft.archived ? 'Unarchive card' : 'Archive card'}</button><button type="button" className="production-card-delete" onClick={() => void deleteCard()} disabled={saving || deletingCard}>{deletingCard ? 'Deleting…' : 'Delete card'}</button></div>
  </article>;
}
