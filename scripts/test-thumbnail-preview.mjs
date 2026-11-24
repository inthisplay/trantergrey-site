import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const temp = await mkdtemp(join(tmpdir(), 'tg-thumbnail-'));
await build({ entryPoints: ['lib/thumbnail-preview.ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(temp, 'preview.mjs') });
const { createThumbnailPreviewLoader, thumbnailFrameTime } = await import(pathToFileURL(join(temp, 'preview.mjs')));
after(() => rm(temp, { recursive: true, force: true }));
function fixture(t) {
  const timers = new Map(), images = [], ready = [], errors = [];
  let id = 0;
  t.mock.method(globalThis, 'setTimeout', (fn, delay) => { timers.set(++id, { fn, delay }); return id; });
  t.mock.method(globalThis, 'clearTimeout', id => timers.delete(id));
  const original = globalThis.Image;
  globalThis.Image = class { constructor() { images.push(this); } decode() { return Promise.resolve(); } };
  t.after(() => { if (original) globalThis.Image = original; else delete globalThis.Image; });
  const run = delay => { for (const [id, task] of [...timers]) if (task.delay === delay) { timers.delete(id); task.fn(); } };
  return { loader: createThumbnailPreviewLoader(url => ready.push(url), url => errors.push(url)), images, ready, errors, run };
}
test('rapid scrubbing requests only the latest frame after the debounce', t => {
  const f = fixture(t);
  f.loader.load('frame1'); f.loader.load('frame2'); f.loader.load('frame3');
  assert.equal(f.images.length, 0); f.run(160);
  assert.equal(f.images.length, 1); assert.equal(f.images[0].src, 'frame3');
});
test('late frames cannot replace the latest selection', async t => {
  const f = fixture(t);
  f.loader.load('old'); f.run(160); const oldLoad = f.images[0].onload;
  f.loader.load('new'); f.run(160); f.images[1].onload(); await Promise.resolve();
  oldLoad(); await Promise.resolve();
  assert.deepEqual(f.ready, ['new']);
});
test('failures preserve the last good frame and retry can recover', async t => {
  const f = fixture(t);
  f.loader.load('good'); f.run(160); f.images[0].onload(); await Promise.resolve();
  f.loader.load('next'); f.run(160); f.images[1].onerror();
  assert.deepEqual(f.ready, ['good']); assert.deepEqual(f.errors, ['next']);
  f.loader.load('next'); f.run(160); f.images[2].onload(); await Promise.resolve();
  assert.deepEqual(f.ready, ['good', 'next']);
});
test('timeouts surface errors; disposed requests cannot update the preview', async t => {
  const f = fixture(t);
  f.loader.load('slow'); f.run(160); const late = f.images[0].onload; f.run(12000);
  late(); await Promise.resolve(); assert.deepEqual(f.errors, ['slow']); assert.deepEqual(f.ready, []);
  f.loader.load('disposed'); f.loader.dispose(); f.run(160); assert.equal(f.images.length, 1);
});
test('frame times stay finite, non-negative, and before the video ends', () => {
  assert.equal(thumbnailFrameTime(100, 100), 99.9);
  assert.equal(thumbnailFrameTime(-10, 100), 0);
  assert.equal(thumbnailFrameTime(NaN, 100), 0);
  assert.equal(thumbnailFrameTime(900.26, 1551), 900.3);
  assert.equal(thumbnailFrameTime(5, .05), 0);
});
