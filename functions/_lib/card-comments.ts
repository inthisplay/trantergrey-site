import { Parser } from 'htmlparser2';
import type { AdminEnvironment } from './admin';
export class CommentReadError extends Error { constructor(message: string, public status = 400) { super(message); } }
type Row = { key: string; source: string; id: string; createdAt: string; updatedAt: string | null; authorName: string | null; bodyHtml: string | null; bodyJson: string | null };
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
const encode = (value: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function references(row: Row) {
  const assetIds = new Set<string>(), playbackIds = new Set<string>(), watchLinks = new Set<string>(), mediaLinks = new Set<string>(), warnings = new Set<string>();
  const addUrl = (value: unknown) => {
    if (typeof value !== 'string' || value.length > 4096) return;
    try {
      const url = new URL(value, 'https://trantergrey.com');
      if (!['https:','http:'].includes(url.protocol) || url.username || url.password) return;
      const playback = url.hostname === 'player.mux.com' ? url.pathname.match(/^\/([A-Za-z0-9_-]+)\/?$/)?.[1]
        : ['stream.mux.com','image.mux.com'].includes(url.hostname) ? url.pathname.match(/^\/([A-Za-z0-9_-]+)(?:\/|\.)/)?.[1] : null;
      // Return canonical Mux references without signed query parameters.
      if (playback) { playbackIds.add(playback); mediaLinks.add(url.origin + url.pathname); }
      if (['trantergrey.com','www.trantergrey.com'].includes(url.hostname) && /^\/watch\/(?:u\/|collection\/)?[A-Za-z0-9_-]+\/?$/.test(url.pathname)) watchLinks.add('https://trantergrey.com' + url.pathname);
    } catch { /* Non-URL text is not a reference. */ }
  };
  const html = row.bodyHtml || '';
  if (html.length > 200000) warnings.add('comment_content_truncated');
  // Parse inert HTML; never execute markup or fetch linked resources.
  let text = '', hidden = 0;
  const parser = new Parser({
    onopentag(tag, attributes) {
      if (['script','style','textarea'].includes(tag)) hidden++;
      if (hidden) return;
      if (['p','div','li','br'].includes(tag)) text += '\n';
      if (['a','iframe','video','source','img','button'].includes(tag)) {
        addUrl(attributes.href); addUrl(attributes.src); addUrl(attributes['data-copy-public-link']);
      }
    },
    ontext(value) { if (!hidden) text += value; },
    onclosetag(tag) {
      if (['script','style','textarea'].includes(tag)) hidden = Math.max(0,hidden-1);
      if (!hidden && ['p','div','li'].includes(tag)) text += '\n';
    },
  }, { decodeEntities: true });
  parser.end(html.slice(0,200000));
  text = text.trim();
  if (row.bodyJson) {
    if (row.bodyJson.length > 200000) warnings.add('structured_content_truncated');
    else try {
      let visited = 0;
      const walk = (node: unknown, depth = 0) => {
        if (++visited > 10000 || depth > 30) { warnings.add('structured_content_truncated'); return; }
        if (Array.isArray(node)) { for (const child of node) walk(child,depth+1); return; }
        if (!node || typeof node !== 'object') return;
        const n = node as Record<string,unknown>;
        if (n.type === 'mux-asset') {
          // Group IDs are not asset IDs. The stored media children identify
          // the exact assets selected when the comment was written.
          if ((!n.itemKind || n.itemKind === 'video') && identifier(n.assetId)) assetIds.add(n.assetId);
          addUrl(n.href); addUrl(n.thumbnailUrl);
          if (Array.isArray(n.media)) for (const entry of n.media.slice(0,500)) {
            if (!entry || typeof entry !== 'object') continue;
            const media = entry as Record<string,unknown>;
            if (identifier(media.id)) assetIds.add(media.id);
            addUrl(media.playerUrl); addUrl(media.thumbnailUrl);
          }
          if (Array.isArray(n.media) && n.media.length>500) warnings.add('structured_content_truncated');
        }
        if (!html && typeof n.text === 'string') text += n.text + '\n';
        for (const key of ['children','blocks','data']) if (n[key]) walk(n[key],depth+1);
      };
      walk(JSON.parse(row.bodyJson));
    } catch { warnings.add('invalid_structured_content'); }
  }
  // Include plain-text URLs and JSON-only text; strip signed Mux query strings.
  text = text.replace(/https?:\/\/[^\s<>"']+|\/watch\/(?:u\/|collection\/)?[A-Za-z0-9_-]+/g, value => {
    const clean = value.replace(/[.,;)]+$/,'');
    addUrl(clean);
    try {
      const url = new URL(clean);
      if (['player.mux.com','stream.mux.com','image.mux.com'].includes(url.hostname)) return url.origin + url.pathname;
    } catch { /* Relative watch link. */ }
    return value;
  });
  if (text.length > 50000) warnings.add('comment_text_truncated');
  return { text: text.slice(0,50000), assetIds: [...assetIds], playbackIds: [...playbackIds], watchLinks: [...watchLinks], mediaLinks: [...mediaLinks], warnings: [...warnings] };
}
export async function readCardComments(env: AdminEnvironment, cardId: string, limit = 20, cursor = '') {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new CommentReadError('limit must be an integer from 1 to 50.');
  const card = await env.TG_DATA.prepare(`SELECT p.source_id AS sourceId FROM production_cards p LEFT JOIN production_card_overrides o ON o.card_source_id=p.source_id WHERE p.id=? AND o.deleted_at IS NULL`).bind(cardId).first<{sourceId:string}>();
  if (!card) throw new CommentReadError('Card not found or deleted.',404);
  let after = { date: '', key: '' };
  if (cursor) {
    try {
      if (cursor.length>3000 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
      const decoded = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(cursor.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));
      if (decoded.cardId !== cardId || typeof decoded.date !== 'string' || typeof decoded.key !== 'string' || decoded.date.length>100 || decoded.key.length>300) throw new Error();
      after = decoded;
    } catch { throw new CommentReadError('Invalid cursor for this card. Start again without a cursor.'); }
  }
  const rows = await env.TG_DATA.prepare(`WITH comments AS (
    SELECT 'local:'||id AS key,'local' AS source,id,COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',created_at),'') AS createdAt,NULL AS updatedAt,author_name AS authorName,body_html AS bodyHtml,body_json AS bodyJson
    FROM production_local_comments WHERE card_source_id=? AND deleted_at IS NULL
    UNION ALL
    SELECT 'imported:'||source_id,'imported',source_id,COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',created_at),''),updated_at,
      CASE WHEN json_valid(author_json) THEN json_extract(author_json,'$.name') ELSE NULL END,body_html,NULL
    FROM production_comments WHERE card_source_id=?
  ) SELECT * FROM comments WHERE createdAt>? OR (createdAt=? AND key>?) ORDER BY createdAt,key LIMIT ?`)
    .bind(card.sourceId,card.sourceId,after.date,after.date,after.key,limit+1).all<Row>();
  const selected=rows.results.slice(0,limit);
  const comments=selected.map(row=>({ id:row.key, sourceId:row.id, source:row.source, createdAt:row.createdAt||null, updatedAt:row.updatedAt, authorName:row.authorName, ...references(row) }));
  const playbackIds=[...new Set(comments.flatMap(c=>c.playbackIds))];
  const mapping=new Map<string,string>();
  // Resolve only from the existing catalog snapshot; never fetch arbitrary URLs
  // or infer an asset ID from a playback ID or a project/collection slug.
  if(playbackIds.length) {
    const matched=await env.TG_DATA.prepare(`SELECT a.asset_id AS assetId,json_extract(a.value,'$.playbackId') AS playbackId FROM mux_library_assets a
      WHERE a.refresh_id=(SELECT refresh_id FROM mux_library_snapshot_state WHERE id='library') AND json_valid(a.value)
      AND json_extract(a.value,'$.playbackId') IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(playbackIds)).all<{assetId:string;playbackId:string}>();
    for(const row of matched.results) mapping.set(row.playbackId,row.assetId);
  }
  const result=comments.map(c=>({ ...c, assetIds:[...new Set([...c.assetIds,...c.playbackIds.flatMap(id=>mapping.has(id)?[mapping.get(id)!]:[])])],
    playbackMatches:c.playbackIds.flatMap(id=>mapping.has(id)?[{playbackId:id,assetId:mapping.get(id),source:'catalog_snapshot'}]:[]),
    unresolvedPlaybackIds:c.playbackIds.filter(id=>!mapping.has(id)),
  }));
  const last=selected.at(-1);
  return { comments:result, nextCursor:rows.results.length>limit && last ? encode({cardId,date:last.createdAt,key:last.key}) : null,
    coverage:'Current non-deleted local comments and imported comments, oldest first. Follow all pages. Watch links can reference projects or collections; resolve those separately. Unresolved playback IDs or warnings mean absence is not established. Pages are not a transactional snapshot of concurrent edits.' };
}
