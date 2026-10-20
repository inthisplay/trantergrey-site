import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(project, 'data', 'vimeo-library.json');
const library = readFileSync(source);
const value = `gzip-base64:${gzipSync(library).toString('base64')}`;
const timestamp = new Date().toISOString();
const temporary = mkdtempSync(path.join(tmpdir(), 'trantergrey-vimeo-migration-'));
const statement = path.join(temporary, 'library.sql');

try {
  const chunks = Array.from({ length: Math.ceil(value.length / 48_000) }, (_, index) => value.slice(index * 48_000, (index + 1) * 48_000));
  const sql = [
    "DELETE FROM vimeo_state_chunks WHERE state_key = 'library';",
    ...chunks.map((chunk, index) => `INSERT INTO vimeo_state_chunks (state_key, chunk_index, value) VALUES ('library', ${index}, '${chunk.replace(/'/g, "''")}');`),
    `INSERT INTO vimeo_state (key, value, updated_at) VALUES ('library', 'chunked-gzip-base64', '${timestamp}') ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
  ].join('\n');
  writeFileSync(statement, sql);
  execFileSync('npx', ['--yes', 'wrangler@4', 'd1', 'execute', 'trantergrey-site-data', '--remote', '--file', statement], { cwd: project, stdio: 'inherit' });
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
