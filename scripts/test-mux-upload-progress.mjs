import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const temp = await mkdtemp(join(tmpdir(), 'tg-mux-progress-'));
await build({ entryPoints: ['lib/mux-upload-errors.ts', 'lib/mux-upload-status.ts', 'functions/api/admin/mux-uploads.ts', 'functions/_lib/mux.ts'], bundle: true, platform: 'node', format: 'esm', outbase: '.', outdir: temp, outExtension: { '.js': '.mjs' } });
const diagnostics = await import(pathToFileURL(join(temp, 'lib/mux-upload-errors.mjs')));
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

test('new direct uploads request 4K while preserving Plus quality, playback policy and title', async t => {
  const { env } = fixture(t);
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests++;
    assert.equal(String(url), 'https://api.mux.com/video/v1/uploads');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), {
      cors_origin: 'https://test',
      new_asset_settings: { playback_policies: ['public'], video_quality: 'plus', max_resolution_tier: '2160p', meta: { title: '4K timing test' } },
    });
    return Response.json({ data: { id: 'upload4K', url: 'https://upload.example.test/fixture' } });
  });
  const response = await api.onRequestPost({
    request: new Request('https://test/api/admin/mux-uploads', { method: 'POST', headers: { cookie: 'tg_admin=test', 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '  4K timing test  ' }) }), env, waitUntil() {},
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { id: 'upload4K', url: 'https://upload.example.test/fixture' });
  assert.equal(requests, 1, 'only creates an upload destination; no existing asset mutation');
});


test('status outages report wait guidance and clear it after recovery', async t => {
  let calls = 0;
  const notices = [];
  t.mock.method(globalThis, 'setTimeout', fn => { queueMicrotask(fn); return 1; });
  t.mock.method(globalThis, 'clearTimeout', () => {});
  t.mock.method(globalThis, 'fetch', async () => ++calls === 1 ? new Response('', { status: 503 }) : Response.json({ assetId: 'asset1', ready: true, status: 'ready' }));
  assert.equal(await client.waitForUpload('upload1', new AbortController().signal, () => {}, true, notice => notices.push(notice)), 'asset1');
  assert.match(notices[0], /Wait.*received.*automatically.*Do not upload/);
  assert.equal(notices.at(-1), undefined);
});

test('terminal states distinguish processing failure, cancellation and expiration', () => {
  for (const status of ['error', 'errored']) assert.match(diagnostics.terminalUploadMessage(status), /Mux processing failed.*re-export or retry/);
  assert.match(diagnostics.terminalUploadMessage('timed_out'), /expired.*library.*retry/);
  assert.match(diagnostics.terminalUploadMessage('cancelled'), /cancelled.*will not continue/);
  for (const status of ['waiting', 'preparing', 'ready', undefined]) assert.equal(diagnostics.terminalUploadMessage(status), undefined);
});

test('phase messages do not confuse received videos with failed transfers', () => {
  assert.match(diagnostics.uploadFailureMessage('prepare', 401), /sign in again.*No video data/);
  assert.match(diagnostics.uploadFailureMessage('prepare', 503), /not started.*HTTP 503.*Retry/);
  assert.match(diagnostics.uploadFailureMessage('transfer'), /could not confirm.*Check the library before retrying/);
  assert.match(diagnostics.uploadFailureMessage('transfer', 403), /Mux returned HTTP 403.*fresh upload/);
  assert.match(diagnostics.uploadFailureMessage('metadata'), /received.*Do not upload.*Save upload details/);
});

test('transfer helper separates HTTP rejection from an unconfirmed network failure', async t => {
  const original = globalThis.XMLHttpRequest;
  t.after(() => { if (original) globalThis.XMLHttpRequest = original; else delete globalThis.XMLHttpRequest; });
  let outcome = 'network';
  globalThis.XMLHttpRequest = class {
    upload = {}; status = 0;
    open(method, url) { assert.equal(method, 'PUT'); assert.equal(url, 'https://upload.example.test'); }
    send() {
      this.upload.onprogress({ lengthComputable: true, loaded: 25, total: 100 });
      if (outcome === 'network') this.onerror();
      else if (outcome === 'abort') this.onabort();
      else { this.status = Number(outcome); this.onload(); }
    }
  };
  const progress = [];
  const transfer = () => diagnostics.transferMuxFile({}, 'https://upload.example.test', n => progress.push(n));
  await assert.rejects(transfer(), e => e.phase === 'transfer' && e.status === undefined);
  outcome = '403'; await assert.rejects(transfer(), e => e.status === 403);
  outcome = 'abort'; await assert.rejects(transfer(), e => e.phase === 'transfer');
  outcome = '200'; await transfer();
  assert.deepEqual(progress, [25, 25, 25, 25]);
});


test('lost transfer responses recover only when Mux confirms an asset exists', async t => {
  const original = new Error('transfer response lost');
  t.mock.method(globalThis, 'fetch', async () => Response.json({ assetId: 'asset1', ready: false, status: 'preparing' }));
  assert.equal((await client.confirmInterruptedTransfer('upload1', original)).assetId, 'asset1');
  t.mock.method(globalThis, 'fetch', async () => Response.json({ assetId: null, ready: false, status: 'waiting' }));
  await assert.rejects(client.confirmInterruptedTransfer('upload1', original), e => e === original);
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 502 }));
  await assert.rejects(client.confirmInterruptedTransfer('upload1', original), e => e === original);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ assetId: null, ready: false, status: 'timed_out' }));
  await assert.rejects(client.confirmInterruptedTransfer('upload1', original), /Upload expired/);
});
