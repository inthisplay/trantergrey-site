import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const manifestPath = args.find((value, index) => !value.startsWith('--') && args[index - 1] !== '--offset' && args[index - 1] !== '--limit') || '/private/tmp/production-local-attachments.json';
const numberAfter = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && Number.isInteger(Number(args[index + 1])) ? Number(args[index + 1]) : fallback;
};
const offset = Math.max(0, numberAfter('--offset', 0));
const limit = Math.max(1, numberAfter('--limit', Number.MAX_SAFE_INTEGER));
if (!existsSync(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const failures = [];
const completed = [];
const selection = manifest.staged.slice(offset, offset + limit);

for (const [index, attachment] of selection.entries()) {
  process.stdout.write(`[${offset + index + 1}/${manifest.staged.length}] ${attachment.filename}\n`);
  try {
    execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `trantergrey-production-archive/${attachment.r2Key}`, '--file', attachment.file, '--content-type', attachment.contentType || 'application/octet-stream', '--local', '--persist-to', '.wrangler/state'], { stdio: 'pipe' });
    completed.push(attachment);
  } catch (error) {
    failures.push({ sourceId: attachment.sourceId, filename: attachment.filename, reason: error instanceof Error ? error.message : 'Local R2 upload failed.' });
  }
}

const quote = (value) => `'${String(value ?? '').replaceAll("'", "''")}'`;
const stateDb = join('.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject', 'b3c3cb390947f4ccec1e65ff944082cf766e261d424d3bfdc9acae7073e9e37c.sqlite');
const sql = ['BEGIN TRANSACTION;'];
for (const attachment of completed) sql.push(`UPDATE production_attachments SET status='stored', failure_reason=NULL WHERE source_id=${quote(attachment.sourceId)};`);
for (const failure of failures) sql.push(`UPDATE production_attachments SET status='failed', failure_reason=${quote(failure.reason.slice(0, 900))} WHERE source_id=${quote(failure.sourceId)};`);
sql.push('COMMIT;');
const sqlFile = '/private/tmp/production-attachment-upload-results.sql';
writeFileSync(sqlFile, sql.join('\n'));
execFileSync('sqlite3', [stateDb, `.read ${sqlFile}`], { stdio: 'inherit' });
writeFileSync('/private/tmp/production-attachment-upload-results.json', JSON.stringify({ completed: completed.length, failures }, null, 2));
console.log(JSON.stringify({ completed: completed.length, failed: failures.length, results: '/private/tmp/production-attachment-upload-results.json' }, null, 2));
if (failures.length) process.exitCode = 1;
