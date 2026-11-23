import type { DeckHistoryEvent, DeckHistoryMedia } from '../../lib/deck-history';

export type HistoryRow = {
  id: string; source_kind: string; occurred_at: string; actor: string; action: string; category: string;
  summary: string; body_html: string; details_json: string; redacted: number;
  cardId: string | null; cardTitle: string | null; columnName: string | null; columnColor: string | null;
  fromColumn: string | null; toColumn: string | null;
};
const decode = (value: string) => value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity: string) => {
  if (entity[0] === '#') { const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''; }
  return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[entity.toLowerCase()] || '';
});
export const historyText = (html: unknown) => decode(String(html ?? '').replace(/<(script|style|button)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<br\b[^>]*>|<\/(?:p|div|li|h[1-6]|blockquote)>/gi, '\n').replace(/<[^>]*>/g, ' ')).replace(/[↗↖↘↙]/g, '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
const attribute = (tag: string, key: string) => decode(tag.match(new RegExp(`\\b${key}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2] || '');
const attachment = (url: string) => /^\/api\/admin\/production-board\/attachments\/[A-Za-z0-9_-]+$/.test(url);
const muxImage = (url: string) => /^https:\/\/image\.mux\.com\/[A-Za-z0-9_/?=&.%+-]+$/.test(url);
const muxPlayer = (url: string) => /^https:\/\/player\.mux\.com\/[A-Za-z0-9_-]+(?:\?[^\s"'<>]*)?$/.test(url);

export function historyMedia(html: string): DeckHistoryMedia[] {
  const media: DeckHistoryMedia[] = [];
  const add = (item: DeckHistoryMedia) => { if (!media.some(existing => existing.url === item.url) && media.length < 6) media.push(item); };
  for (const match of html.matchAll(/<(img|video|audio|iframe|source)\b[^>]*>/gi)) {
    const tag = match[0], name = match[1].toLowerCase(), url = attribute(tag, 'src');
    const title = attribute(tag, 'alt') || attribute(tag, 'title') || (name === 'img' ? 'Image attachment' : 'Video attachment');
    if (name === 'iframe' && muxPlayer(url)) {
      const playback = new URL(url).pathname.slice(1);
      add({ kind: 'embed', url, title, poster: `https://image.mux.com/${playback}/thumbnail.jpg?width=640` });
    } else if (attachment(url) || (name === 'img' && muxImage(url))) {
      add({ kind: name === 'img' ? 'image' : name === 'audio' ? 'audio' : 'video', url, title });
    }
  }
  for (const match of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)) {
    const url = attribute(match[0], 'href');
    if (attachment(url) || /^https?:\/\/[^\s<>"']+$/i.test(url) || /^\/watch\/(?:collection\/)?[A-Za-z0-9_-]+$/.test(url)) add({ kind: 'file', url, title: historyText(match[0]) || 'Open link' });
  }
  return media;
}
const parse = (value: string): Record<string, unknown> => { try { const result = JSON.parse(value); return result && typeof result === 'object' ? result : {}; } catch { return {}; } };
const list = (value: unknown): string => {
  if (typeof value === 'string' && value.startsWith('[')) { try { return list(JSON.parse(value)); } catch { /* Old text remains readable. */ } }
  if (Array.isArray(value)) return value.map(item => typeof item === 'object' && item ? String(item.name || '') : String(item)).filter(Boolean).sort().join(', ');
  return historyText(value);
};
export function presentHistory(row: HistoryRow): DeckHistoryEvent {
  const details = parse(row.details_json);
  const before = details.before && typeof details.before === 'object' ? details.before as Record<string, unknown> : {};
  const after = details.after && typeof details.after === 'object' ? details.after as Record<string, unknown> : {};
  const changes: DeckHistoryEvent['changes'] = [];
  let action = row.action, text = historyText(row.body_html), media = historyMedia(row.body_html);
  let summary = historyText(row.summary);
  if (row.source_kind === 'edit') {
    for (const [key, label] of [['title', 'Title'], ['client', 'Client'], ['assignees', 'Assigned to'], ['dueOn', 'Due date'], ['archived', 'Archive state']] as const) {
      if (key in after && list(before[key]) !== list(after[key])) changes.push({ label, before: key === 'archived' ? Number(before[key]) ? 'Archived' : 'Active' : list(before[key]) || 'None', after: key === 'archived' ? Number(after[key]) ? 'Archived' : 'Active' : list(after[key]) || 'None' });
    }
    const notesChanged = 'notes' in after && historyText(before.notes) !== historyText(after.notes);
    if (!notesChanged) { text = ''; media = []; }
    if (action === 'card_updated') {
      if ('archived' in after && Number(before.archived) !== Number(after.archived)) action = Number(after.archived) ? 'card_archived' : 'card_restored';
      else if (notesChanged) action = 'notes_updated';
      else if (changes.length === 1 && changes[0].label === 'Assigned to') action = 'assignment_updated';
    }
    if (action === 'card_moved') changes.unshift({ label: 'Status', before: row.fromColumn || 'Previous column', after: row.toColumn || row.columnName || 'New column' });
    if (notesChanged && !text) summary = 'Cleared the notes.';
  }
  if (action === 'column_renamed') changes.push({ label: 'Column name', before: list(details.before) || 'Original name', after: list(details.after) });
  if (action === 'column_color_changed') changes.push({ label: 'Background', before: list(details.before) || 'Default', after: list(details.after) || 'Default' });
  if (action === 'column_sorted') summary = details.direction === 'oldest' ? 'Oldest cards first.' : 'Newest cards first.';
  if (action === 'attachment_added' && typeof details.attachmentId === 'string') {
    const url = `/api/admin/production-board/attachments/${details.attachmentId}`;
    const type = String(details.contentType || '');
    if (attachment(url)) media = [{ kind: type.startsWith('image/') ? 'image' : type.startsWith('video/') ? 'video' : type.startsWith('audio/') ? 'audio' : 'file', url, title: String(details.filename || 'Attachment') }];
  }
  if (action === 'video_linked' && typeof details.playerUrl === 'string' && muxPlayer(details.playerUrl)) media = [{ kind: 'embed', url: details.playerUrl, title: String(details.title || 'Mux video'), poster: `https://image.mux.com/${new URL(details.playerUrl).pathname.slice(1)}/thumbnail.jpg?width=640` }];
  let actor = row.actor;
  if (actor === 'Unknown author' && action === 'imported_event') actor = summary.match(/^(.+?)\s+(?:moved|completed|reopened|added|changed|archived|assigned|unassigned|renamed|created)\b/i)?.[1] || actor;
  return { id: row.id, occurredAt: row.occurred_at || null, actor, action, category: row.category, cardId: row.cardId, cardTitle: row.cardTitle, columnName: row.columnName, columnColor: row.columnColor, summary, text: row.redacted ? '' : text.slice(0, 12000), media: row.redacted ? [] : media, redacted: Boolean(row.redacted), source: row.source_kind.startsWith('import-') || row.source_kind === 'created' && row.cardId?.startsWith('bc-card-') ? 'Basecamp archive' : 'The Deck', changes };
}
