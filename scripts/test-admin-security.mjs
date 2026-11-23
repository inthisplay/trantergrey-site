import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(join(tmpdir(), 'tg-admin-security-'));
const handlers = {};
for (const [name, path] of Object.entries({
  auth: 'functions/_lib/admin.ts', logout: 'functions/api/admin/logout.ts',
  login: 'functions/api/admin/login.ts', config: 'functions/api/auth/config.ts',
  html: 'lib/production-html.ts', import: 'functions/_lib/production-board.ts',
  card: 'functions/api/admin/production-board/[id].ts',
})) {
  const outfile = join(dir, name + '.mjs');
  await build({ entryPoints: [path], bundle: true, platform: 'browser', format: 'esm', outfile });
  handlers[name] = await import(pathToFileURL(outfile));
}
after(() => rm(dir, { recursive: true, force: true }));
const clean = handlers.html.sanitizeProductionHtml;
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE admin_sessions (id TEXT PRIMARY KEY, expires_at TEXT, user_name TEXT, user_email TEXT)');
  const env = { ADMIN_PASSWORD: 'old-secret', GOOGLE_CLIENT_ID: 'google', GOOGLE_CLIENT_SECRET: 'secret', TG_DATA: {
    prepare(sql) { let values = []; return {
      bind(...args) { values = args; return this; },
      async first() { return db.prepare(sql).get(...values) || null; },
      async run() { return db.prepare(sql).run(...values); },
    }; },
  } };
  const request = (cookie = '', origin = 'https://app.test') => new Request('https://app.test/api/admin/logout', { method: 'POST', headers: { cookie, origin } });
  return { db, env, request };
}

test('logout revokes precisely the current session, prevents replay, and is idempotent', async () => {
  const { db, env, request } = fixture();
  try {
    const first = await handlers.auth.adminCookie(env, { name: 'Team', email: 'team@trantergrey.com' });
    const second = await handlers.auth.adminCookie(env, { name: 'Other', email: 'other@trantergrey.com' });
    const req = request(first.split(';')[0]);
    assert.ok(await handlers.auth.adminSession(req, env));
    assert.equal((await handlers.logout.onRequestPost({ request: request(first.split(';')[0], 'https://evil.test'), env })).status, 403);
    assert.ok(await handlers.auth.adminSession(req, env));
    const response = await handlers.logout.onRequestPost({ request: req, env });
    assert.equal(response.status, 303);
    assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal(await handlers.auth.adminSession(req, env), null);
    assert.ok(await handlers.auth.adminSession(request(second.split(';')[0]), env));
    assert.equal((await handlers.logout.onRequestPost({ request: req, env })).status, 303);
    assert.equal((await handlers.logout.onRequestPost({ request: request(), env })).status, 303);
  } finally { db.close(); }
});

test('failed revocation never reports successful logout', async () => {
  const { db, env, request } = fixture(); db.close();
  await assert.rejects(handlers.logout.onRequestPost({ request: request('tg_admin=existing'), env }));
});

test('password authentication and legacy sessions fail closed even with the old secret configured', async () => {
  const { db, env, request } = fixture();
  try {
    db.prepare('INSERT INTO admin_sessions VALUES(?,?,?,?)').run('old', '9999', 'Admin', null);
    assert.equal(await handlers.auth.adminSession(request('tg_admin=old'), env), null);
    const response = await handlers.login.onRequestPost({ env, request: new Request('https://app.test/api/admin/login', { method: 'POST', body: new URLSearchParams({ password: 'old-secret' }) }) });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.deepEqual(await (await handlers.config.onRequestGet({ env })).json(), { google: true, password: false });
    assert.equal(handlers.auth.configured({ ADMIN_PASSWORD: 'old-secret' }), false);
    await assert.rejects(handlers.auth.adminCookie(env, { name: 'Admin' }));
    await assert.rejects(handlers.auth.adminCookie(env, { name: 'Outsider', email: 'outsider@example.com' }));
  } finally { db.close(); }
});

test('sanitizer preserves Basecamp formatting, colors, mentions, checklists, attachments and app controls', () => {
  const html = '<h1>Title</h1><div><strong>Bold</strong><em>Italic</em><del>Old</del><br><span style="color:rgb(207, 0, 0);background-color:rgb(242, 237, 255)">Color</span></div><ol start="3"><li value="4">Item</li></ol><bc-mention class="mentionable-person">Team</bc-mention><bc-attachment content-type="image/png"><figure class="production-imported-attachment production-imported-attachment--image"><img src="/api/admin/production-board/attachments/file" width="640" alt="Photo"><figcaption>Caption</figcaption></figure></bc-attachment><ul class="production-note-checklist"><li><input type="checkbox" checked>Task</li></ul><iframe src="https://player.mux.com/abcdef" allowfullscreen></iframe><button type="button" data-copy-public-link="/watch/demo">Copy public link</button>';
  const result = clean(html);
  for (const expected of ['<h1>Title</h1>', '<strong>Bold</strong>', '<em>Italic</em>', '<del>Old</del>', 'color:rgb(207, 0, 0)', 'background-color:rgb(242, 237, 255)', 'start="3"', 'value="4"', 'mentionable-person', 'production-imported-attachment--image', 'width="640"', '<figcaption>Caption</figcaption>', 'type="checkbox"', 'checked', 'https://player.mux.com/abcdef', 'data-copy-public-link="/watch/demo"']) assert.ok(result.includes(expected), expected);
  assert.equal(clean(result), result);
});

test('sanitizer removes executable HTML, encoded URL attacks, dangerous CSS and embedded documents', () => {
  const payloads = [
    '<img src="/photo" onerror="alert(1)"><script>alert(1)</script>',
    '<a href="java&#x73;cript:alert(1)">link</a>',
    '<a href="java&#10;script:alert(1)">link</a>',
    '<iframe src="https://evil.test" srcdoc="<script>alert(1)</script>"></iframe>',
    '<svg onload="alert(1)"><foreignObject><img src=x onerror=alert(1)></foreignObject><animate attributeName="href" values="javascript:alert(1)" /></svg>',
    '<math><mtext><img src=x onerror=alert(1)></mtext></math>',
    '<span style="position:fixed;background-image:url(https://evil.test);color:expression(alert(1))">text</span>',
    '<form action="https://evil.test"><input name="secret" type="password"></form>',
    '<img src="data:image/svg+xml,<svg onload=alert(1)>">',
  ];
  for (const payload of payloads) {
    const result = clean(payload);
    assert.doesNotMatch(result, /<script|onerror|onload|javascript:|srcdoc|<foreignobject|<animate|<math|position:|background-image|expression\(|<form|type="password"|data:image/i);
    assert.doesNotMatch(result, /src="https:\/\/evil.test/);
  }
});

test('future imports sanitize display HTML while retaining source JSON', async () => {
  const calls = [];
  const env = { TG_DATA: {
    prepare(sql) { return { bind(...args) { calls.push({ sql, args }); return this; }, async run() {} }; },
    async batch() {},
  } };
  const description = '<h2>Keep heading</h2><img src="/photo" onerror="alert(1)">';
  await handlers.import.importProductionSnapshot(env, { sourceBoardId: 'board', columns: [{ id: 'column', title: 'Column', cards: [{ id: 'card', title: 'Card', description }] }] });
  const insert = calls.find(c => c.sql.startsWith('INSERT INTO production_cards'));
  assert.equal(insert.args[5], clean(description));
  assert.equal(JSON.parse(insert.args[13]).description, description);
});

test('existing records are sanitized at the card API boundary without database writes', async () => {
  const dirty = '<h2>Existing</h2><img src="/photo" onerror="alert(1)">';
  const env = { TG_DATA: { prepare(sql) { return {
    bind() { return this; },
    async first() {
      if (sql.includes('FROM admin_sessions')) return { name: 'Team', email: 'team@trantergrey.com' };
      if (sql.includes('SELECT p.*')) return { source_id: 'source', notes_html: dirty, source_notes_html: dirty, description_html: dirty };
      throw new Error(sql);
    },
    async all() {
      if (sql.includes('FROM production_comments')) return { results: [{ body_html: dirty }] };
      if (sql.includes('FROM production_local_comments')) return { results: [{ bodyHtml: dirty }] };
      return { results: [] };
    },
    async run() { throw new Error('Read must not write'); },
  }; } } };
  const response = await handlers.card.onRequestGet({ env, params: { id: 'card' }, request: new Request('https://app.test/api/admin/production-board/card', { headers: { cookie: 'tg_admin=test' } }) });
  assert.equal(response.status, 200);
  const data = await response.json();
  for (const html of [data.card.notes_html, data.card.description_html, data.card.source_notes_html, data.comments[0].body_html, data.localComments[0].bodyHtml]) assert.equal(html, clean(dirty));
});

test('HTML sanitization runs in the actual Workers runtime, including color styles', async () => {
  const { Miniflare, convertV4MiniflareOptions } = await import('miniflare');
  const bundle = await build({
    stdin: { contents: `import { sanitizeProductionHtml } from './lib/production-html';
      export default { async fetch(request) { return new Response(sanitizeProductionHtml(await request.text())); } };`, resolveDir: process.cwd() },
    bundle: true, format: 'esm', platform: 'browser', write: false,
  });
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'sanitizer', compatibilityDate: '2026-10-20', modules: true, script: bundle.outputFiles[0].text }] }));
  try {
    const response = await mf.dispatchFetch('https://sanitizer.test/', { method: 'POST', body: '<h2 style="color:rgb(207, 0, 0)" onclick="alert(1)">Title</h2><script>alert(1)</script>' });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '<h2 style="color:rgb(207, 0, 0)">Title</h2>');
  } finally { await mf.dispose(); }
});
