import { slateHtml } from './production-comment-html';
export type NoteContent = { body?: string; body_format?: string; body_json?: string | null };

export function readClientNoteValue(json: string): unknown[] {
  if (json.length > 100000) throw new Error('Keep notes under 100,000 characters.');
  const value: unknown = JSON.parse(json);
  let count = 0;
  const visit = (node: unknown, depth: number): void => {
    if (++count > 5000 || depth > 20 || !node || typeof node !== 'object') throw new Error('Invalid note content.');
    const n = node as Record<string, unknown>;
    if ('text' in n) { if (typeof n.text !== 'string') throw new Error('Invalid note text.'); return; }
    if (!['paragraph','heading-one','heading-two','block-quote','bulleted-list','numbered-list','list-item','mux-asset'].includes(String(n.type)) || !Array.isArray(n.children) || !n.children.length) throw new Error('Invalid note block.');
    if (n.align && !['left','center','right','justify'].includes(String(n.align))) throw new Error('Invalid alignment.');
    for (const [key, pattern] of Object.entries({href:/^\/watch\/(?:collection\/)?[A-Za-z0-9_-]+$/,thumbnailUrl:/^https:\/\/image\.mux\.com\/[A-Za-z0-9_/?=&.%+-]+$/,playerUrl:/^https:\/\/player\.mux\.com\/[A-Za-z0-9_-]+(?:\?[^"'<>]*)?$/})) {
      if (n[key] != null && (typeof n[key] !== 'string' || !pattern.test(n[key] as string))) throw new Error('Invalid Mux URL.');
    }
    if (n.type === 'mux-asset') {
      for (const key of ['assetId','title','client','itemKind']) if (n[key] != null && typeof n[key] !== 'string') throw new Error('Invalid Mux item.');
      if (n.media != null) {
        if (!Array.isArray(n.media)) throw new Error('Invalid Mux media.');
        n.media.forEach(media=>visit({...media,type:'paragraph',children:[{text:''}]},depth+1));
      }
    }
    n.children.forEach(child=>visit(child,depth+1));
  };
  if (!Array.isArray(value) || !value.length) throw new Error('Invalid note content.');
  value.forEach(node=>visit(node,0));
  return value;
}

export const escapeNoteText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Rebuild only the formatting emitted by the Deck notes toolbar. Never retain
// pasted attributes, embedded media, executable elements, or arbitrary styles.
export function sanitizeClientNote(html: string): string {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<[^>]*>/g, tag => {
    const match = tag.match(/^<(\/)?([a-z0-9]+)\b([^>]*)>$/i);
    if (!match) return '';
    const [, close, rawName, attrs] = match;
    const name = rawName.toLowerCase();
    if (!['p','div','span','h2','h3','blockquote','ul','ol','li','br','strong','b','em','i','u','s','code','pre','input'].includes(name)) return '';
    if (name === 'input') return !close && /\btype=["']checkbox["']/i.test(attrs) ? `<input type="checkbox"${/\schecked(?:\s|=|\/|$)/i.test(attrs) ? ' checked' : ''}>` : '';
    if (close) return `</${name}>`;
    return `<${name}${name === 'ul' && /\bclass=["']production-note-checklist["']/i.test(attrs) ? ' class="production-note-checklist"' : ''}>`;
  }).replace(/<(?!\/?[a-z][^>]*>)/gi, '&lt;');
}

export function clientNoteHtml(note: NoteContent): string {
  if (note.body_json) { try { return slateHtml(readClientNoteValue(note.body_json)); } catch { /* Fall back to legacy body. */ } }
  return note.body_format === 'html' ? sanitizeClientNote(note.body || '') : escapeNoteText(note.body || '').replace(/\n/g, '<br>');
}

export function clientNoteText(note: NoteContent): string {
  if (note.body_format !== 'html' && !note.body_json) return note.body || '';
  return clientNoteHtml(note).replace(/<br>|<\/(?:p|div|h2|h3|li)>/g, '\n').replace(/<[^>]*>/g, '').replace(/&(?:amp|lt|gt|quot|nbsp|#39);/g, entity => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&nbsp;':' ','&#39;':"'"}[entity] || entity));
}

export function clientNotePreview(note: NoteContent) {
  const videos: {title:string;label:string;duration:string|null}[] = [];
  if (note.body_json) {
    try {
      const text = (node: unknown): string => {
        const n = node as Record<string,unknown>;
        if (n.type === 'mux-asset') {
          const seconds=typeof n.duration === 'number' && Number.isFinite(n.duration) && n.duration>=0 && n.itemKind!=='collection' && n.itemKind!=='ratio-group' ? Math.round(n.duration) : null;
          const duration=seconds===null ? null : seconds>=3600 ? `${Math.floor(seconds/3600)}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}` : `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
          videos.push({title:typeof n.title === 'string' && n.title.trim() ? n.title : 'Untitled video',label:n.itemKind === 'collection' ? 'Collection' : n.itemKind === 'ratio-group' ? 'Video group' : 'Video',duration});
          return '';
        }
        if (typeof n.text === 'string') return n.text;
        return (n.children as unknown[]).map(text).join('') + '\n';
      };
      return {text:readClientNoteValue(note.body_json).map(text).join('').trim(),videos};
    } catch { /* Legacy or invalid structured content uses the text fallback. */ }
  }
  return {text:clientNoteText(note),videos:[]};
}
