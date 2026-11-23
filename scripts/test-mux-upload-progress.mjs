import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const temp = await mkdtemp(join(tmpdir(), 'tg-mux-progress-'));
await build({ entryPoints: ['lib/mux-upload-status.ts', 'functions/api/admin/mux-uploads.ts', 'functions/_lib/mux.ts'], bundle: true, platform: 'node', format: 'esm', outbase: '.', outdir: temp, outExtension: { '.js': '.mjs' } });
const client = await import(pathToFileURL(join(temp, 'lib/mux-upload-status.mjs')));
const api = await import(pathToFileURL(join(temp, 'functions/api/admin/mux-uploads.mjs')));
const mux = await import(pathToFileURL(join(temp, 'functions/_lib/mux.mjs')));
after(() => rm(temp, { recursive: true, force: true }));

function fixture(t, asset = {}) {
  const calls = [];
  const env = { GOOGLE_CLIENT_ID: 'test', GOOGLE_CLIENT_SECRET: 'test', MUX_TOKEN_ID: 'test', MUX_TOKEN_SECRET: 'test', TG_DATA: { prepare(sql) { return { bind() { return this; }, async first() { return sql.includes('admin_sessions') ? { name: 'Test', email: 'test@example.test' } : null; }, async run() { return { meta: { changes: 0 } }; } }; } } };
  t.mock.method(globalThis, 'fetch', async url => {
    calls.push(String(url));
    return Response.json({ data: String(url).includes('/uploads/') ? { asset_id: 'asset1', status: 'asset_created' } : { id: 'asset1', status: 'preparing', playback_ids: [{ id: 'play1', policy: 'public' }], progress: { state: 'transcoding', progress: 23.9 }, ...asset } });
  });
  const get = (query = 'uploadId=upload1', authenticated = true) => api.onRequestGet({ request: new Request(`https://test/api/admin/mux-uploads?${query}`, { headers: authenticated ? { cookie: 'tg_admin=test' } : {} }), env, waitUntil() {} });
  return { env, calls, get };
}

test('progress is truthful across transcoding, ingestion, completion and invalid numbers', () => {
  assert.deepEqual(client.normalizeProcessing({ state: 'transcoding', progress: 23.9 }), { state: 'transcoding', percent: 23 });
  for (const progress of [-1, 101, NaN, Infinity, '50', undefined]) assert.equal(client.normalizeProcessing({ state: 'transcoding', progress }).percent, null);
  for (const state of ['ingesting', 'completed', 'errored', 'live']) assert.equal(client.normalizeProcessing({ state, progress: 100 }).percent, null);
  assert.equal(client.normalizeProcessing(undefined), null);
  assert.equal(client.processingLabel({ state: 'ingesting', percent: null }), 'Preparing playback');
});
test('status is authenticated and invalid identifiers never reach Mux', async t => {
  const { get, calls } = fixture(t);
  assert.equal((await get('uploadId=upload1', false)).status, 401);
  assert.equal((await get('assetId=bad/id')).status, 400);
  assert.equal(calls.length, 0);
});
test('received asset is not playable until ready and progress is returned', async t => {
  const { get } = fixture(t);
  const result = await (await get()).json();
  assert.equal(result.ready, false);
  assert.equal(result.assetId, 'asset1');
  assert.deepEqual(result.processing, { state: 'transcoding', percent: 23 });
});
test('ready requires public playback; signed playback is never promoted', async t => {
  const { get } = fixture(t, { status: 'ready', playback_ids: [{ id: 'signed1', policy: 'signed' }] });
  assert.equal((await (await get()).json()).ready, false);
});
test('ready public asset stays playable and metadata normalization preserves downloads', async t => {
  const { env, get } = fixture(t, { status: 'ready', duration: 1500, static_renditions: { files: [{ name: 'high.mp4', status: 'ready' }] } });
  assert.equal((await (await get()).json()).ready, true);
  const asset = await mux.getMuxLibraryAsset(env, 'asset1');
  assert.equal(asset.duration, 1500);
  assert.equal(asset.staticRenditions[0].url, 'https://stream.mux.com/play1/high.mp4');
});
test('asset polling returns current status without exposing credentials', async t => {
  const { get, calls } = fixture(t);
  const result = await get('assetId=asset1');
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  assert.equal((await result.json()).playbackId, 'play1');
  assert.equal(calls.length, 1);
});
test('Mux outages return a retryable response with no upstream error content', async t => {
  const { get } = fixture(t);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('sensitive upstream response'); });
  const result = await get();
  assert.equal(result.status, 502);
  assert.ok(!(await result.text()).includes('sensitive'));
});
test('cancelled uploads without an asset report a terminal status', async t => {
  const { get } = fixture(t);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ data: { status: 'cancelled' } }));
  assert.deepEqual(await (await get()).json(), { assetId: null, ready: false, status: 'cancelled' });
});
test('wait survives more than ten minutes of polls and transient errors, then completes', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'setTimeout', fn => { queueMicrotask(fn); return 1; });
  t.mock.method(globalThis, 'clearTimeout', () => {});
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (calls === 3) throw new TypeError('offline');
    if (calls === 5) return new Response('', { status: 502 });
    return Response.json({ assetId: 'asset1', ready: calls > 151, status: calls > 151 ? 'ready' : 'preparing' });
  });
  const result = await client.waitForUpload('upload1', new AbortController().signal, () => {});
  assert.equal(result, 'asset1');
  assert.equal(calls, 152);
});
test('wait stops on real failure, expired authentication and unmount', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ assetId: 'asset1', ready: false, status: 'errored' }));
  await assert.rejects(client.waitForUpload('upload1', new AbortController().signal, () => {}), /could not process/);
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 401 }));
  await assert.rejects(client.waitForUpload('upload1', new AbortController().signal, () => {}), /Sign in again/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(client.waitForUpload('upload1', controller.signal, () => {}), { name: 'AbortError' });
});
