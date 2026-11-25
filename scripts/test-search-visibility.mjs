import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { isUnlistedPath, unlistedRobots } from '../lib/search-visibility.mjs';

const dir = await mkdtemp(join(tmpdir(), 'tg-robots-'));
await build({ entryPoints: ['functions/_middleware.ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'middleware.mjs') });
const { onRequest } = await import(pathToFileURL(join(dir, 'middleware.mjs')));
after(() => rm(dir, { recursive: true, force: true }));

test('unlisted pages, alternate URLs, APIs and attachment responses carry strict crawler directives', async () => {
  for (const path of ['/watch', '/watch/', '/watch.html', '/watch/u/film', '/watch/collection/reel', '/showcase?videos=abc', '/work', '/app/deck', '/admin', '/meet', '/our-work/collections', '/custom-collection', '/api/watch/film', '/api/admin/production-board/attachments/123']) {
    for (const status of [200, 302, 404]) {
      const response = await onRequest({ request: new Request('https://example.com' + path), env: { TG_DATA: { prepare: () => ({ bind() { return this; }, first: async () => ({hits:1}) }) } }, next: async () => new Response('content', { status, headers: { 'Content-Type': 'application/octet-stream' } }) });
      assert.equal(response.headers.get('X-Robots-Tag'), unlistedRobots, path);
      assert.equal(response.status, status);
      assert.equal(await response.text(), 'content');
    }
  }
});
test('published marketing pages remain indexable', () => {
  for (const path of ['/', '/our-work', '/our-work.html', '/case-studies/example', '/privacy-policy/', '/assets/logo.png']) assert.equal(isUnlistedPath(path), false, path);
});
