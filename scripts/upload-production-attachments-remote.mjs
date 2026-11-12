import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const valueFlags = new Set(['--offset', '--limit', '--source-id', '--file-suffix', '--content-type']);
const manifestPath = args.find((value, index) => !value.startsWith('--') && !valueFlags.has(args[index - 1])) || '/private/tmp/production-local-attachments.json';
const sourceIds = args.flatMap((value, index) => value === '--source-id' && args[index + 1] ? [args[index + 1]] : []);
const fileSuffixes = args.flatMap((value, index) => value === '--file-suffix' && args[index + 1] ? [args[index + 1]] : []);
const contentTypeIndex = args.indexOf('--content-type');
const contentTypeOverride = contentTypeIndex >= 0 ? args[contentTypeIndex + 1] : null;
if (contentTypeIndex >= 0 && !contentTypeOverride) throw new Error('--content-type requires a MIME type.');
const numberAfter = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && Number.isInteger(Number(args[index + 1])) ? Number(args[index + 1]) : fallback;
};
const offset = Math.max(0, numberAfter('--offset', 0));
const limit = Math.max(1, numberAfter('--limit', Number.MAX_SAFE_INTEGER));
if (!existsSync(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const selection = sourceIds.length || fileSuffixes.length
  ? manifest.staged.filter((attachment) => sourceIds.includes(attachment.sourceId) || fileSuffixes.some((suffix) => attachment.file.endsWith(suffix)))
  : manifest.staged.slice(offset, offset + limit);
if (sourceIds.length && selection.length !== sourceIds.length) throw new Error('One or more requested source IDs were not present in the manifest.');
if (fileSuffixes.length && selection.length < fileSuffixes.length) throw new Error('One or more requested file suffixes were not present in the manifest.');
const completed = [];
const failures = [];

for (const [index, attachment] of selection.entries()) {
  process.stdout.write(`[${offset + index + 1}/${manifest.staged.length}] ${attachment.filename}\n`);
  try {
    const contentType = contentTypeOverride || attachment.contentType || 'application/octet-stream';
    execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `trantergrey-production-archive/${attachment.r2Key}`, '--remote', '--file', attachment.file, '--content-type', contentType], { stdio: 'pipe' });
    completed.push({ ...attachment, uploadedContentType: contentType });
  } catch (error) {
    failures.push({ sourceId: attachment.sourceId, filename: attachment.filename, reason: error instanceof Error ? error.message : 'R2 upload failed.' });
  }
}

const quote = (value) => `'${String(value ?? '').replaceAll("'", "''")}'`;
// Remote D1 file execution is already atomic and rejects explicit transaction
// statements, so this deliberately emits plain idempotent updates.
const sql = [];
for (const attachment of completed) sql.push(`UPDATE production_attachments SET status='stored', content_type=${quote(attachment.uploadedContentType)}, failure_reason=NULL WHERE source_id=${quote(attachment.sourceId)};`);
for (const failure of failures) sql.push(`UPDATE production_attachments SET status='failed', failure_reason=${quote(failure.reason.slice(0, 900))} WHERE source_id=${quote(failure.sourceId)};`);
// Keep batch artifacts separate so a resumed upload can never overwrite a
// concurrently finishing batch's D1 update file.
const batchId = `${offset}-${offset + selection.length}`;
const resultsSql = `/private/tmp/production-attachment-upload-results-${batchId}.sql`;
writeFileSync(resultsSql, sql.join('\n'));
// Wrangler's remote `--file` upload can lose its temporary staging object on
// larger batches. The same idempotent statements are reliable in command mode.
if (completed.length || failures.length) execFileSync('npx', ['wrangler', 'd1', 'execute', 'trantergrey-site-data', '--remote', '--command', sql.join('\n')], { stdio: 'inherit' });
const resultsJson = `/private/tmp/production-attachment-upload-results-${batchId}.json`;
writeFileSync(resultsJson, JSON.stringify({ completed: completed.length, failures, nextOffset: offset + selection.length }, null, 2));
console.log(JSON.stringify({ completed: completed.length, failed: failures.length, results: resultsJson, nextOffset: offset + selection.length }, null, 2));
if (failures.length) process.exitCode = 1;
