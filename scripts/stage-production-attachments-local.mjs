import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';

const exportRoot = resolve(process.argv[2] || '');
const compressedRoot = resolve(process.argv[3] || '');
if (!existsSync(exportRoot) || !existsSync(compressedRoot)) {
  throw new Error('Usage: node scripts/stage-production-attachments-local.mjs <basecamp-export-directory> <compressed-video-directory>');
}

const stateDb = join('.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject', 'b3c3cb390947f4ccec1e65ff944082cf766e261d424d3bfdc9acae7073e9e37c.sqlite');
if (!existsSync(stateDb)) throw new Error(`Local D1 database was not found at ${stateDb}. Start the local app once, then retry.`);
const quote = (value) => `'${String(value ?? '').replaceAll("'", "''")}'`;
const htmlEscape = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const rows = JSON.parse(execFileSync('sqlite3', ['-json', stateDb, `SELECT source_id AS sourceId, card_source_id AS cardSourceId, comment_source_id AS commentSourceId, filename, content_type AS contentType, source_url AS sourceUrl, r2_key AS r2Key FROM production_attachments WHERE source_id LIKE 'bc-attachment-%' ORDER BY source_id`], { encoding: 'utf8' }) || '[]');

const candidateKey = (url, filename) => `${url || ''}\u0000${filename || ''}`;
const exportCandidates = new Map();
const cardsDir = join(exportRoot, 'card-table-columns', 'cards');
for (const file of readdirSync(cardsDir).filter((name) => name.endsWith('.html'))) {
  const html = readFileSync(join(cardsDir, file), 'utf8');
  for (const match of html.matchAll(/<bc-attachment\b([^>]*)>([\s\S]*?)<\/bc-attachment>/gi)) {
    const attrs = match[1];
    const attribute = (name) => attrs.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))?.[1] || '';
    const sourceUrl = attribute('href') || attribute('url');
    const filename = attribute('filename');
    const localPath = match[2].match(/href="[^"?#]*(all-files-images-pdfs-spreadsheets-etc\/[^"?#]+)"/i)?.[1] || '';
    if (!sourceUrl || !filename || !localPath) continue;
    const key = candidateKey(sourceUrl, filename);
    const list = exportCandidates.get(key) || [];
    list.push(localPath);
    exportCandidates.set(key, list);
  }
}

const staged = [];
const unavailable = [];
const sql = ['BEGIN TRANSACTION;'];
for (const row of rows) {
  const candidates = exportCandidates.get(candidateKey(row.sourceUrl, row.filename)) || [];
  const exportRelativePath = candidates.shift() || '';
  const sourceFile = exportRelativePath ? join(exportRoot, exportRelativePath) : '';
  const compressedFile = exportRelativePath ? join(compressedRoot, exportRelativePath) : '';
  const isVideo = String(row.contentType || '').startsWith('video/');
  const file = isVideo && existsSync(compressedFile) ? compressedFile : sourceFile;
  const r2Key = row.r2Key || `basecamp/${row.sourceId}/${row.filename}`;
  const endpoint = `/api/admin/production-board/attachments/${encodeURIComponent(row.sourceId)}`;
  const sourceHtmlUrl = htmlEscape(row.sourceUrl);
  const sourceJson = JSON.stringify({ exportRelativePath, compressed: isVideo && existsSync(compressedFile), originalSourceUrl: row.sourceUrl });
  if (file && existsSync(file) && statSync(file).isFile()) {
    staged.push({ ...row, file, r2Key, endpoint, exportRelativePath, compressed: isVideo && existsSync(compressedFile) });
    sql.push(`UPDATE production_attachments SET r2_key=${quote(r2Key)}, status='pending', failure_reason=NULL, source_json=${quote(sourceJson)} WHERE source_id=${quote(row.sourceId)};`);
    sql.push(`UPDATE production_cards SET description_html=REPLACE(description_html, ${quote(sourceHtmlUrl)}, ${quote(endpoint)}) WHERE source_id=${quote(row.cardSourceId)};`);
    if (row.commentSourceId) sql.push(`UPDATE production_comments SET body_html=REPLACE(body_html, ${quote(sourceHtmlUrl)}, ${quote(endpoint)}) WHERE source_id=${quote(row.commentSourceId)};`);
  } else {
    unavailable.push({ ...row, exportRelativePath, reason: exportRelativePath ? 'The exported file is unavailable.' : 'No matching exported attachment file was found.' });
    sql.push(`UPDATE production_attachments SET status='unavailable', failure_reason=${quote(unavailable.at(-1).reason)} WHERE source_id=${quote(row.sourceId)};`);
  }
}
sql.push('COMMIT;');
const workspaceTemp = join('/private/tmp', 'production-attachment-stage.sql');
writeFileSync(workspaceTemp, sql.join('\n'));
const manifestPath = join('/private/tmp', 'production-local-attachments.json');
writeFileSync(manifestPath, JSON.stringify({ staged, unavailable }, null, 2));
console.log(JSON.stringify({ staged: staged.length, unavailable: unavailable.length, sql: workspaceTemp, manifest: manifestPath }, null, 2));
