import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const temp = await mkdtemp(join(tmpdir(), 'tg-mux-refresh-'));
await build({ entryPoints: ['lib/mux-library-refresh.ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(temp, 'refresh.mjs') });
const { createMuxLibraryRefresh, excludeDeletedMuxAssets } = await import(pathToFileURL(join(temp, 'refresh.mjs')));
after(() => rm(temp, { recursive: true, force: true }));

test('page load refresh is shared by concurrent reads and not repeated by filtering', async t => {
  let calls = 0, resolve;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++; assert.equal(url, '/api/admin/mux-refresh'); assert.equal(options.method, 'POST');
    return new Promise(done => { resolve = done; });
  });
  const page = createMuxLibraryRefresh();
  const first = page.ensure(), second = page.ensure();
  assert.equal(calls, 1);
  resolve(new Response('{}'));
  await Promise.all([first, second]);
  await page.ensure();
  assert.equal(calls, 1);
  const reload = createMuxLibraryRefresh().ensure();
  assert.equal(calls, 2); resolve(new Response('{}')); await reload;
});
test('failed refresh stays visible until an explicit retry, which can recover', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: ++calls === 1 ? 502 : 200 }));
  const page = createMuxLibraryRefresh();
  await assert.rejects(page.ensure(), /out of date/);
  await assert.rejects(page.ensure(), /out of date/);
  assert.equal(calls, 1);
  await page.retry(); await page.ensure(); assert.equal(calls, 2);
});
test('confirmed deletions are excluded from stale responses and retained selection', () => {
  const deleted = new Set(['removed']);
  assert.deepEqual(excludeDeletedMuxAssets([{ id: 'removed' }, { id: 'keep' }], deleted), [{ id: 'keep' }]);
  assert.deepEqual(excludeDeletedMuxAssets([{ id: 'removed' }], deleted), []);
  assert.deepEqual(excludeDeletedMuxAssets([{ id: 'keep' }], new Set()), [{ id: 'keep' }]);
});
