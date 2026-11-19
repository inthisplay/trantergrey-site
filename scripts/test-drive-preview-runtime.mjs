import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('Drive preview delivery works in Workers for PDFs, images, exports and ranges without following redirects', async () => {
 const bundle = await build({
  stdin: { contents: `
   import { drivePreviewResponse } from './functions/_lib/client-drive-preview';
   export default { fetch(request) {
    const id = new URL(request.url).pathname.slice(1);
    return drivePreviewResponse(request, 'test-token', {
     id, name: id, mimeType: id === 'png' ? 'image/png' : id === 'doc' ? 'application/vnd.google-apps.document' : 'application/pdf'
    });
   } };
  `, resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'browser', write: false,
 });
 const mf = new Miniflare(convertV4MiniflareOptions({ workers: [
  { name: 'preview', compatibilityDate: '2026-10-20', modules: true, script: bundle.outputFiles[0].text, outboundService: 'google' },
  { name: 'google', compatibilityDate: '2026-10-20', modules: true, script: `
   export default { fetch(request) {
    const url = new URL(request.url);
    if (url.hostname !== 'www.googleapis.com' || request.headers.get('authorization') !== 'Bearer test-token') return new Response('Unexpected destination', {status: 500});
    if (url.pathname.endsWith('/redirect')) return new Response(null, {status: 302, headers: {Location: 'https://untrusted.example/file'}});
    if (url.pathname.endsWith('/denied')) return new Response('Denied', {status: 403});
    if (url.pathname.endsWith('/export') && url.searchParams.get('mimeType') !== 'application/pdf') return new Response(null, {status: 400});
    const range = request.headers.get('range');
    return new Response(range ? 'PDF' : 'file bytes', {status: range ? 206 : 200, headers: range ? {'Content-Range': 'bytes 0-2/10', 'Accept-Ranges': 'bytes'} : {}});
   } };
  ` },
 ] }));
 try {
  for (const [id, type] of [['pdf', 'application/pdf'], ['png', 'image/png'], ['doc', 'application/pdf']]) {
   const response = await mf.dispatchFetch(`https://preview.test/${id}`);
   assert.equal(response.status, 200);
   assert.equal(response.headers.get('content-type'), type);
   assert.equal(response.headers.get('cache-control'), 'private, no-store');
   assert.equal(await response.text(), 'file bytes');
  }
  const range = await mf.dispatchFetch('https://preview.test/pdf', {headers: {Range: 'bytes=0-2'}});
  assert.equal(range.status, 206);
  assert.equal(range.headers.get('content-range'), 'bytes 0-2/10');
  assert.equal(await range.text(), 'PDF');
  assert.equal((await mf.dispatchFetch('https://preview.test/redirect')).status, 502);
  assert.equal((await mf.dispatchFetch('https://preview.test/denied')).status, 403);
 } finally { await mf.dispose(); }
});
