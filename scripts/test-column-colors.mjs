// Exercises the real handler and additive migration against isolated SQLite.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(join(tmpdir(), 'tg-column-colors-'));
await build({ entryPoints: ['functions/api/admin/production-board/columns/[id].ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(directory, 'column.mjs') });
const { onRequestPatch } = await import(pathToFileURL(join(directory, 'column.mjs')));
after(() => rm(directory, { recursive: true, force: true }));
const migration = await readFile('migrations/0023_production_column_colors.sql', 'utf8');
const originalSchema = await readFile('migrations/0012_production_column_controls.sql', 'utf8');

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE admin_sessions (id TEXT, user_name TEXT, user_email TEXT, expires_at TEXT);
    INSERT INTO admin_sessions VALUES ('test', 'Test', 'test@trantergrey.com', '9999-01-01');
    CREATE TABLE production_columns (source_id TEXT PRIMARY KEY, name TEXT);
    INSERT INTO production_columns VALUES ('edit', 'edit'), ('done', 'Done');`);
  db.exec(originalSchema);
  db.exec("INSERT INTO production_column_overrides VALUES ('edit', 'Editing', 0, 'before')");
  db.exec(migration);
  db.exec("ALTER TABLE production_column_overrides ADD COLUMN edited_by TEXT NOT NULL DEFAULT 'Admin'");
  const env = { GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture', TG_DATA: { prepare(sql) {
    let args = [];
    const statement = { bind(...values) { args = values; return statement; },
      async first() { return db.prepare(sql).get(...args) ?? null; },
      async run() { return db.prepare(sql).run(...args); } };
    return statement;
  } } };
  return { db, async patch(body, id = 'edit', authenticated = true) {
    const response = await onRequestPatch({ env, params: { id }, request: new Request('https://local.test/api/admin/production-board/columns/' + id, {
      method: 'PATCH', headers: authenticated ? { cookie: 'tg_admin=test' } : {}, body: JSON.stringify(body),
    }) });
    return { status: response.status, body: await response.json() };
  } };
}

test('saving and resetting colors preserve column identity, name, and archive state', async () => {
  const { db, patch } = fixture();
  try {
    assert.deepEqual(await patch({ action: 'color', color: ' #752B34 ' }), { status: 200, body: { color: '#752b34' } });
    assert.deepEqual({ ...db.prepare('SELECT name, archived, color FROM production_column_overrides WHERE column_source_id=?').get('edit') }, { name: 'Editing', archived: 0, color: '#752b34' });
    await patch({ action: 'rename', name: 'Final edit' });
    assert.equal(db.prepare('SELECT color FROM production_column_overrides').get().color, '#752b34');
    await patch({ action: 'color', color: null });
    assert.deepEqual({ ...db.prepare('SELECT name, archived, color FROM production_column_overrides').get() }, { name: 'Final edit', archived: 0, color: null });
    await patch({ action: 'color', color: '#cce1e2' }, 'done');
    assert.equal(db.prepare("SELECT color FROM production_column_overrides WHERE column_source_id='done'").get().color, '#cce1e2');
    assert.equal(db.prepare("SELECT name FROM production_columns WHERE source_id='edit'").get().name, 'edit');
  } finally { db.close(); }
});

test('invalid colors, missing columns, and unauthenticated writes are rejected', async () => {
  const { db, patch } = fixture();
  try {
    for (const color of ['red', '#fff', '#zzzzzz', 'url(example)', '', 123, undefined]) assert.equal((await patch({ action: 'color', color })).status, 400);
    assert.equal((await patch({ action: 'color', color: '#000000' }, 'missing')).status, 404);
    assert.equal((await patch({ action: 'color', color: '#000000' }, 'edit', false)).status, 401);
    assert.equal(db.prepare('SELECT color FROM production_column_overrides').get().color, null);
  } finally { db.close(); }
});
