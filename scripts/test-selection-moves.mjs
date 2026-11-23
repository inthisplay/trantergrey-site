// Run with Node 22.13+ (node:sqlite): node --test scripts/test-selection-moves.mjs
// Exercises the actual Pages handler against isolated, in-memory SQLite.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(join(tmpdir(), 'tg-selection-test-'));
await build({ entryPoints: ['functions/api/admin/video-collections/move.ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(directory, 'move.mjs') });
const { onRequestPost } = await import(pathToFileURL(join(directory, 'move.mjs')));
after(() => rm(directory, { recursive: true, force: true }));
const now = new Date().toISOString();
const collection = (id) => ({ id, name: id, slug: id + '-original', description: null, tags: [], createdAt: now, updatedAt: now });
const project = (id, ids, collectionIds = ['source']) => ({
  id, slug: id + '-original', legacySlugs: [id + '-older'], title: id, client: 'Test', description: null,
  variants: ids.map((assetId, order) => ({ assetId, label: '16:9', aspectRatio: '16:9', order })),
  collectionIds, createdAt: now, updatedAt: now,
});

function fixture(projects = [project('group', ['A', 'B'])], assetIds = ['A', 'B', 'C']) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE admin_sessions (id TEXT, user_name TEXT, user_email TEXT, expires_at TEXT);
    INSERT INTO admin_sessions VALUES ('test', 'Test', NULL, '9999-01-01');
    CREATE TABLE mux_video_projects (id TEXT PRIMARY KEY, slug TEXT UNIQUE, value TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE mux_video_collections (id TEXT PRIMARY KEY, slug TEXT UNIQUE, value TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE mux_library_browse_state (id TEXT, refresh_id TEXT, refreshed_at TEXT, asset_count INTEGER);
    CREATE TABLE mux_library_browse_assets (asset_id TEXT, refresh_id TEXT, value TEXT);
  `);
  function insert(table, value) {
    db.prepare('INSERT INTO ' + table + ' VALUES (?, ?, ?, ?, ?)').run(value.id, value.slug, JSON.stringify(value), now, now);
  }
  projects.forEach((p) => insert('mux_video_projects', p));
  [collection('source'), collection('destination')].forEach((c) => insert('mux_video_collections', c));
  db.prepare('INSERT INTO mux_library_browse_state VALUES (?, ?, ?, ?)').run('library', 'test', now, assetIds.length);
  assetIds.forEach((id) => db.prepare('INSERT INTO mux_library_browse_assets VALUES (?, ?, ?)').run(id, 'test', JSON.stringify({ id, title: 'Video ' + id, client: 'Test', aspectRatio: '16:9' })));
  let beforeBatch = () => {};
  const env = { TG_DATA: {
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async run() { return db.prepare(sql).run(...args); },
        execute() { return db.prepare(sql).all(...args); },
      };
      return statement;
    },
    async batch(statements) {
      beforeBatch();
      db.exec('BEGIN');
      try { statements.forEach((s) => s.execute()); db.exec('COMMIT'); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  } };
  return {
    db, insert, race(fn) { beforeBatch = fn; },
    async move(body, authenticated = true) {
      const request = new Request('https://local.test/api/admin/video-collections/move', { method: 'POST', headers: authenticated ? { cookie: 'tg_admin=test' } : {}, body: JSON.stringify(body) });
      const response = await onRequestPost({ request, env });
      return { status: response.status, ...(await response.json()) };
    },
    stored() { return db.prepare('SELECT value FROM mux_video_projects ORDER BY id').all().map((r) => JSON.parse(r.value)); },
  };
}

test('whole groups move, keeping project and collection URLs', async () => {
  const f = fixture();
  const result = await f.move({ assetIds: ['A', 'B'], destination: 'destination' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.projects[0].collectionIds, ['destination']);
  assert.equal(result.projects[0].variants.length, 2);
  assert.equal(result.projects[0].slug, 'group-original');
  assert.deepEqual(result.projects[0].legacySlugs, ['group-older']);
  assert.equal(result.collections.find((c) => c.id === 'source').slug, 'source-original');
  assert.equal(f.db.prepare('SELECT refreshed_at FROM mux_library_browse_state').get().refreshed_at, null);
  f.db.close();
});

test('partial group move leaves the original page with remaining versions', async () => {
  const f = fixture();
  const result = await f.move({ assetIds: ['B'], destination: 'new', name: 'New set', sourceCollectionId: 'source' });
  assert.equal(result.status, 200);
  const original = result.projects.find((p) => p.id === 'group');
  assert.deepEqual(original.variants.map((v) => v.assetId), ['A']);
  assert.equal(original.slug, 'group-original');
  assert.deepEqual(original.collectionIds, ['source']);
  const moved = result.projects.find((p) => p.id !== 'group');
  assert.deepEqual(moved.variants.map((v) => v.assetId), ['B']);
  assert.equal(result.collections.find((c) => c.id === moved.collectionIds[0]).name, 'New set');
  f.db.close();
});

test('solo separation keeps every asset and retains the original link on the first version', async () => {
  const f = fixture();
  const result = await f.move({ assetIds: ['A', 'B'], destination: 'solo', sourceCollectionId: 'source' });
  assert.equal(result.status, 200);
  assert.equal(result.projects.length, 2);
  assert.ok(result.projects.every((p) => p.variants.length === 1 && p.collectionIds.length === 0));
  assert.equal(result.projects.find((p) => p.slug === 'group-original').variants[0].assetId, 'A');
  assert.equal(result.collections.length, 2);
  f.db.close();
});

test('remove rejects mixed, multiple-collection, missing-source and same-source selections without writes', async () => {
  for (const [projects, body] of [
    [[project('group', ['A'])], { assetIds: ['A', 'C'], sourceCollectionId: 'source', destination: 'solo' }],
    [[project('group', ['A']), project('other', ['B'], ['destination'])], { assetIds: ['A', 'B'], sourceCollectionId: 'source', destination: 'solo' }],
    [[project('group', ['A'])], { assetIds: ['A'], destination: 'solo' }],
    [[project('group', ['A'])], { assetIds: ['A'], destination: 'source', sourceCollectionId: 'source' }],
  ]) {
    const f = fixture(projects); const before = f.stored();
    assert.equal((await f.move(body)).status, 400);
    assert.deepEqual(f.stored(), before);
    f.db.close();
  }
});

test('loose videos can move together with collection members', async () => {
  const f = fixture();
  const result = await f.move({ assetIds: ['A', 'B', 'C'], destination: 'destination' });
  assert.equal(result.status, 200);
  assert.equal(result.projects.flatMap((p) => p.variants).length, 3);
  assert.ok(result.projects.every((p) => p.collectionIds.join() === 'destination'));
  f.db.close();
});

test('concurrent changes reject the entire move', async () => {
  for (const loose of [false, true]) {
    const f = fixture();
    f.race(() => {
      if (loose) f.insert('mux_video_projects', project('concurrent', ['C']));
      else f.db.prepare('UPDATE mux_video_projects SET value = ? WHERE id = ?').run(JSON.stringify(project('group', ['A'])), 'group');
    });
    const result = await f.move({ assetIds: loose ? ['C'] : ['A', 'B'], destination: 'new', name: 'Must not exist' });
    assert.equal(result.status, 409);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM mux_video_collections').get().n, 2);
    assert.ok(f.stored().every((p) => p.collectionIds.join() === 'source'));
    f.db.close();
  }
});

test('invalid destination, unavailable asset and unauthenticated request do not mutate', async () => {
  for (const [body, auth] of [
    [{ assetIds: ['A'], destination: 'missing' }, true],
    [{ assetIds: ['MISSING'], destination: 'destination' }, true],
    [{ assetIds: ['A'], destination: 'destination' }, false],
  ]) {
    const f = fixture(); const before = f.stored();
    assert.notEqual((await f.move(body, auth)).status, 200);
    assert.deepEqual(f.stored(), before);
    f.db.close();
  }
});
