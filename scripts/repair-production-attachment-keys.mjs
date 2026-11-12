import { execFileSync } from 'node:child_process';

const database = 'trantergrey-site-data';
const output = execFileSync('npx', [
  'wrangler', 'd1', 'execute', database, '--remote', '--json',
  '--command', 'SELECT source_id, r2_key FROM production_attachments WHERE r2_key IS NOT NULL;',
], { encoding: 'utf8' });
const response = JSON.parse(output);
const rows = response[0]?.results ?? [];
const repairs = rows
  .map((row) => ({ sourceId: row.source_id, r2Key: row.r2_key, decoded: decodeURIComponent(row.r2_key) }))
  .filter((row) => row.r2Key !== row.decoded);

if (!repairs.length) {
  console.log('No encoded attachment keys need repair.');
  process.exit(0);
}

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sql = repairs
  .map(({ sourceId, decoded }) => `UPDATE production_attachments SET r2_key=${quote(decoded)} WHERE source_id=${quote(sourceId)};`)
  .join('\n');
execFileSync('npx', ['wrangler', 'd1', 'execute', database, '--remote', '--command', sql], { stdio: 'inherit' });
console.log(`Repaired ${repairs.length} archived attachment key${repairs.length === 1 ? '' : 's'}.`);
