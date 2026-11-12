import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/import-basecamp-export.mjs <production-goonz-export-dir>');
const cardsDir = join(source, 'card-table-columns/cards');
if (!readdirSync(cardsDir).some(filename => filename.endsWith('.html'))) throw new Error(`No card pages found in ${cardsDir}`);
const columns = new Map([['triage','5464192690'], ['not-now','5464192692'], ['pre-prod','5464192694'], ['in-progress','5464192700'], ['edit','5465629497'], ['done','5464192703']]);
const columnNames = new Map([['triage','Triage'], ['not-now','Not now'], ['pre-prod','pre prod'], ['in-progress','In progress'], ['edit','edit'], ['done','Done']]);
const cardPositions = new Map();

// Each Basecamp column page is an ordered list. Preserve that order rather
// than relying on timestamps, which is especially important for old cards
// that were manually reordered in Basecamp.
for (const [slug, columnId] of columns) {
  const columnPage = join(source, 'card-table-columns', `${slug}-${columnId}.html`);
  if (!existsSync(columnPage)) continue;
  let position = 0;
  for (const match of readFileSync(columnPage, 'utf8').matchAll(/card-table-columns\/cards\/[^"']*-(\d+)\.html/gi)) {
    cardPositions.set(match[1], position);
    position += 1;
  }
}
const sql = [];
const commentSql = [];
const eventSql = [];
const quote = (value) => `'${String(value ?? '').replaceAll("'", "''")}'`;
const namedEntities = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

// Basecamp's static export preserves some text entities literally in card
// headings (for example, `&#39;`). Decode those for plain-text fields so they
// never leak into the archive UI. Two passes also cover a double-escaped
// entity without trying to parse or transform the source HTML.
const decodeTextEntities = (value) => {
  let decoded = String(value ?? '');
  for (let pass = 0; pass < 2; pass += 1) {
    decoded = decoded.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, token) => {
      const name = token.toLowerCase();
      if (name in namedEntities) return namedEntities[name];
      const numeric = name.startsWith('#x') ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      if (!Number.isInteger(numeric) || numeric < 0 || numeric > 0x10ffff) return entity;
      try {
        return String.fromCodePoint(numeric);
      } catch {
        return entity;
      }
    });
  }
  return decoded;
};

// Rich-text fields are rendered as HTML. Only unwrap a doubly escaped entity
// here: this keeps safe HTML entity escaping intact (e.g. `&lt;script&gt;`) while
// ensuring visible apostrophes and quotes are not displayed as entity text.
const normalizeRichTextEntities = (value) => {
  let normalized = String(value ?? '');
  for (let pass = 0; pass < 2; pass += 1) {
    normalized = normalized.replace(/&amp;(?=(?:#x[0-9a-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);)/gi, '&');
  }
  return normalized;
};

const strip = (value) => decodeTextEntities(String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
const attr = (attributes, name) => decodeTextEntities(attributes.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))?.[1] || '');
const htmlEscape = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const attachmentSql = [];
let attachmentIndex = 0;

// Preserve Basecamp attachments inside the surrounding rich text. The source
// export supplies the signed Basecamp URL now; attachment records retain the
// metadata required to migrate these files into R2 before deployment.
const preserveAttachments = (value, cardSourceId, commentSourceId, exportFile) => normalizeRichTextEntities(value).replace(/<bc-attachment\b([^>]*)>([\s\S]*?)<\/bc-attachment>/gi, (whole, attributes, innerHtml) => {
  const filename = attr(attributes, 'filename');
  const contentType = attr(attributes, 'content-type');
  const sourceUrl = attr(attributes, 'href') || attr(attributes, 'url');
  const byteSize = Number.parseInt(attr(attributes, 'filesize'), 10);
  if (!filename || !sourceUrl || contentType === 'application/vnd.basecamp.mention') return whole;
  const sourceId = `bc-attachment-${cardSourceId}-${commentSourceId || 'card'}-${String(++attachmentIndex).padStart(4, '0')}`;
  const exportHref = innerHtml.match(/href="[^"?#]*(all-files-images-pdfs-spreadsheets-etc\/[^"?#]+)"/i)?.[1] || '';
  const r2Key = `basecamp/${sourceId}/${encodeURIComponent(filename)}`;
  attachmentSql.push(`INSERT INTO production_attachments (source_id,card_source_id,comment_source_id,filename,content_type,byte_size,r2_key,source_url,status,source_json,imported_at) VALUES (${quote(sourceId)},${quote(cardSourceId)},${commentSourceId ? quote(commentSourceId) : 'NULL'},${quote(filename)},${quote(contentType)},${Number.isFinite(byteSize) ? byteSize : 'NULL'},${quote(r2Key)},${quote(sourceUrl)},'pending',${quote(JSON.stringify({ exportFile, sourceUrl, exportHref }))},datetime('now'));`);
  const url = `/api/admin/production-board/attachments/${encodeURIComponent(sourceId)}`; const name = htmlEscape(filename); const link = `<a href="${url}" target="_blank" rel="noreferrer">${name}</a>`;
  if (contentType.startsWith('image/')) return `<figure class="production-imported-attachment production-imported-attachment--image"><a href="${url}" target="_blank" rel="noreferrer"><img src="${url}" alt="${name}" loading="lazy"></a><figcaption>${link}</figcaption></figure>`;
  if (contentType.startsWith('video/')) return `<figure class="production-imported-attachment production-imported-attachment--video"><video controls preload="metadata" src="${url}"></video><figcaption>${link}</figcaption></figure>`;
  return `<p class="production-imported-attachment production-imported-attachment--file">${link}</p>`;
});

for (const filename of readdirSync(cardsDir)) {
  if (!filename.endsWith('.html')) continue;
  const html = readFileSync(join(cardsDir, filename), 'utf8');
  const id = filename.match(/-(\d+)\.html$/)?.[1];
  const columnSlug = html.match(/card-table-columns\/([\w-]+)-\d+\.html/)?.[1];
  const columnId = columnSlug && columns.get(columnSlug);
  const titleHtml = html.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)?.[1] || basename(filename, '.html');
  const title = strip(titleHtml).replace(/^✔\s*/, '');
  const createdAt = html.match(/added this on\s*<time datetime="([^"]+)"/i)?.[1] || null;
  const completedAt = html.match(/Completed\s*<time datetime="([^"]+)"/i)?.[1] || null;
  // Stop at the Notes definition's closing dd, rather than its first nested
  // div, so Basecamp paragraphs, lists, embeds, and attachments survive.
  const notesBlock = html.match(/<dt>Notes<\/dt>[\s\S]*?<div class="formatted_content">([\s\S]*?)<\/dd>/i)?.[1] || '';
  const notes = preserveAttachments(notesBlock.replace(/<\/div>\s*$/, ''), id, null, filename);
  // The static export puts the whole project roster in an avatar group near
  // the page header, even when a card has no assignments. It does not expose
  // the card-specific assignee field, so importing those avatar names would
  // create false assignments. Preserve an empty source value instead; local
  // assignments are managed in the Production Board override layer.
  const assignees = [];
  const position = cardPositions.get(id);
  if (!id || !columnId) continue;
  const raw = JSON.stringify({ exportFile: filename, source: 'Basecamp export' });
  sql.push(`INSERT INTO production_cards (id,source_id,column_source_id,position,title,description_html,archived,assignees_json,created_at,updated_at,completed_at,source_json,imported_at) VALUES (${quote(`bc-card-${id}`)},${quote(id)},${quote(columnId)},${Number.isInteger(position) ? position : 'NULL'},${quote(title)},${quote(notes)},0,${quote(JSON.stringify(assignees))},${createdAt ? quote(createdAt) : 'NULL'},${createdAt ? quote(createdAt) : 'NULL'},${completedAt ? quote(completedAt) : 'NULL'},${quote(raw)},datetime('now')) ON CONFLICT(source_id) DO UPDATE SET column_source_id=excluded.column_source_id,position=excluded.position,title=excluded.title,description_html=excluded.description_html,assignees_json=excluded.assignees_json,created_at=excluded.created_at,updated_at=excluded.updated_at,completed_at=excluded.completed_at,source_json=excluded.source_json,imported_at=excluded.imported_at;`);
  for (const entry of html.matchAll(/<article data-recording-id="(\d+)"[\s\S]*?<\/article>/g)) {
    const commentId = entry[1]; const block = entry[0];
    const author = strip(block.match(/class="thread-entry__author">([\s\S]*?)<\//)?.[1] || 'Unknown');
    const createdAt = block.match(/<time datetime="([^"]+)"/)?.[1] || '';
    // The formatted content itself commonly contains nested divs. Capture it
    // through the card's metadata marker rather than stopping at the first
    // nested closing div.
    const body = preserveAttachments(block.match(/class="formatted_content">([\s\S]*?)<\/div>\s*<div class="thread-entry__metadata/)?.[1] || '', id, commentId, filename);
    commentSql.push(`INSERT INTO production_comments (source_id,card_source_id,body_html,author_json,created_at,updated_at,source_json,imported_at) VALUES (${quote(commentId)},${quote(id)},${quote(body)},${quote(JSON.stringify({ name: author }))},${quote(createdAt)},${quote(createdAt)},${quote(JSON.stringify({ exportFile: filename }))},datetime('now')) ON CONFLICT(source_id) DO UPDATE SET body_html=excluded.body_html,author_json=excluded.author_json,created_at=excluded.created_at,updated_at=excluded.updated_at,imported_at=excluded.imported_at;`);
  }
  let eventOrder = 0;
  for (const entry of html.matchAll(/<article class="thread-entry thread-entry--event">([\s\S]*?)<\/article>/g)) {
    eventOrder += 1;
    const block = entry[0];
    const summary = strip(block.match(/<(?:strong|div)[^>]*class="thread-entry__event-content"[^>]*>([\s\S]*?)<\/(?:strong|div)>/)?.[1] || '');
    const eventType = block.match(/icons\/src\/([^".]+)\./)?.[1] || 'activity';
    const occurredAt = block.match(/<time datetime="([^"]+)"/)?.[1] || null;
    if (!summary) continue;
    const sourceId = `bc-event-${id}-${String(eventOrder).padStart(4, '0')}`;
    const sourceJson = JSON.stringify({ exportFile: filename, sourceOrder: eventOrder, timestampAvailable: Boolean(occurredAt) });
    eventSql.push(`INSERT INTO production_events (source_id,card_source_id,occurred_at,event_type,creator_json,summary,source_json,imported_at) VALUES (${quote(sourceId)},${quote(id)},${occurredAt ? quote(occurredAt) : 'NULL'},${quote(eventType)},NULL,${quote(summary)},${quote(sourceJson)},datetime('now')) ON CONFLICT(source_id) DO UPDATE SET occurred_at=excluded.occurred_at,event_type=excluded.event_type,summary=excluded.summary,source_json=excluded.source_json,imported_at=excluded.imported_at;`);
  }
}
const clearSql = [
  'PRAGMA foreign_keys = OFF;',
  'DELETE FROM production_attachments;',
  'DELETE FROM production_local_comments;',
  'DELETE FROM production_comments;',
  'DELETE FROM production_events;',
  'DELETE FROM production_card_steps;',
  'DELETE FROM production_card_edit_log;',
  'DELETE FROM production_card_overrides;',
  'DELETE FROM production_column_overrides;',
  'DELETE FROM production_cards;',
  'DELETE FROM production_columns;',
  'DELETE FROM production_imports;',
  'PRAGMA foreign_keys = ON;',
];
const columnSql = [...columns.entries()].map(([slug, sourceId], position) => `INSERT INTO production_columns (source_id,name,position,column_type,imported_at) VALUES (${quote(sourceId)},${quote(columnNames.get(slug) || slug)},${position},'active',datetime('now'));`);
const importedCounts = { columns: columnSql.length, cards: sql.length, comments: commentSql.length, events: eventSql.length, attachments: attachmentSql.length };
const auditSql = `INSERT INTO production_imports (id,source_board_id,started_at,completed_at,status,source_counts,imported_counts,notes) VALUES (${quote(`basecamp-export-2026-11-12-${Date.now()}`)},'5464192687',datetime('now'),datetime('now'),'complete',${quote(JSON.stringify(importedCounts))},${quote(JSON.stringify(importedCounts))},${quote(JSON.stringify(['Imported from Basecamp export dated 2026-11-12. Attachment records point to Basecamp source URLs until the deployment archive is uploaded.']))});`;
const output = join('/private/tmp', 'production-board-import.sql');
writeFileSync(output, ['BEGIN TRANSACTION;', ...clearSql, ...columnSql, ...sql, ...commentSql, ...eventSql, ...attachmentSql, auditSql, 'COMMIT;'].join('\n'));
console.log(JSON.stringify({ ...importedCounts, output }));
