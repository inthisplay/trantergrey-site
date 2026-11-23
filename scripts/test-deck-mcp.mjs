import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const temp = await mkdtemp(join(tmpdir(), 'tg-deck-mcp-'));
await build({ entryPoints: ['functions/_lib/notifications.ts','functions/api/admin/inbox.ts','functions/api/internal/v1/notifications.ts','workers/deck-mcp/index.ts', 'functions/api/internal/v1/cards.ts', 'functions/api/admin/mcp-connections.ts', 'functions/api/internal/v1/client-hq.ts', 'functions/api/admin/client-hq.ts', 'functions/_lib/integration-request.ts', 'functions/_lib/integration-health.ts', 'functions/_lib/mcp-events.ts', 'functions/api/webhooks/mux.ts', 'functions/api/admin/integration-health.ts', 'functions/api/internal/v1/cards/[id]/comments.ts'], bundle: true, platform: 'node', format: 'esm', outbase: '.', outdir: temp, outExtension: { '.js': '.mjs' } });
const worker = (await import(pathToFileURL(join(temp, 'workers/deck-mcp/index.mjs')))).default;
const { onRequestPost } = await import(pathToFileURL(join(temp, 'functions/api/internal/v1/cards.mjs')));
const { onRequest: manageConnections } = await import(pathToFileURL(join(temp, 'functions/api/admin/mcp-connections.mjs')));
const { onRequest: clientHQApi } = await import(pathToFileURL(join(temp, 'functions/api/internal/v1/client-hq.mjs')));
const { onRequest: clientHQAdmin } = await import(pathToFileURL(join(temp, 'functions/api/admin/client-hq.mjs')));
const { integrationRequest } = await import(pathToFileURL(join(temp, 'functions/_lib/integration-request.mjs')));
const { enforceRateLimit, cleanupIntegrationHealth } = await import(pathToFileURL(join(temp, 'functions/_lib/integration-health.mjs')));
const { onRequest: healthApi } = await import(pathToFileURL(join(temp, 'functions/api/admin/integration-health.mjs')));
const { onRequestGet: readComments } = await import(pathToFileURL(join(temp, 'functions/api/internal/v1/cards/[id]/comments.mjs')));
after(() => rm(temp, { recursive: true, force: true }));
const schemas = await Promise.all(['0008_production_board', '0009_production_card_overrides', '0010_production_card_work_fields', '0011_production_card_sort_order', '0012_production_column_controls', '0013_production_comment_blocks', '0015_production_comment_authors', '0051_comment_questions', '0017_internal_api_foundation', '0025_production_card_deletions', '0052_card_creation_requests', '0053_mcp_item_requests','0054_integration_health','0055_notifications','0018_mux_library_snapshot'].map(name => readFile(`migrations/${name}.sql`, 'utf8')));
const authSchema = await readFile('workers/deck-mcp/auth-schema.sql', 'utf8') + await readFile('workers/deck-mcp/events-schema.sql','utf8');
const {enqueueMuxReady,deliverEvents}=await import(pathToFileURL(join(temp,'functions/_lib/mcp-events.mjs')));
const {onRequestPost:muxWebhook}=await import(pathToFileURL(join(temp,'functions/api/webhooks/mux.mjs')));
const hash = async value => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('base64url');

function binding(db) {
  let batchTail=Promise.resolve();
  return { prepare(sql) {
    let values = [];
    const s = { bind(...v) { values = v; return s; }, async first() { return db.prepare(sql).get(...values) ?? null; }, async all() { return { results: db.prepare(sql).all(...values) }; }, async run() { return db.prepare(sql).run(...values); } };
    return s;
  }, async batch(statements) {
    const previous=batchTail;let release;batchTail=new Promise(resolve=>{release=resolve;});await previous;
    db.exec('BEGIN');
    try { const result = []; for (const s of statements) result.push(await s.run()); db.exec('COMMIT'); return result; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
    finally {release();}
  } };
}
function fixture(t) {
  const db = new DatabaseSync(':memory:'); const auth = new DatabaseSync(':memory:');
  for (const schema of schemas) db.exec(schema);
  auth.exec(authSchema);
  db.exec(`CREATE TABLE client_directory(name TEXT PRIMARY KEY,created_at TEXT,id TEXT UNIQUE,archived INTEGER DEFAULT 0);
    CREATE TABLE client_workspace_items(id TEXT PRIMARY KEY,workspace_id TEXT,kind TEXT,title TEXT,body TEXT,body_format TEXT,body_json TEXT,completed INTEGER,due_on TEXT,assignee TEXT,updated_at TEXT,completed_at TEXT);
    CREATE TABLE admin_team_directory(nickname TEXT,email TEXT);
    CREATE TABLE client_drive_extra_folders(client_id TEXT,folder_id TEXT,name TEXT);
    CREATE TABLE client_activity(id TEXT PRIMARY KEY,client_id TEXT,occurred_at TEXT,actor TEXT,action TEXT,category TEXT,summary TEXT);
    INSERT INTO client_directory VALUES('Taylor BMW','now','bmw',0);
    INSERT INTO admin_team_directory VALUES('Taylor','taylor@trantergrey.com');
    CREATE TABLE admin_sessions(id TEXT,user_name TEXT,user_email TEXT,expires_at TEXT);
    INSERT INTO production_columns(source_id,name,position,imported_at) VALUES ('ideas','Ideas',1,'now'),('production','Production',2,'now'),('archived','Archived',3,'now');
    INSERT INTO production_column_overrides(column_source_id,archived,edited_at) VALUES('archived',1,'now');`);
  const env = { TG_DATA: binding(db), MCP_AUTH: binding(auth), MCP_ORIGIN: 'https://mcp.test', DECK_ORIGIN: 'https://deck.test', TEST_ACCESS_CODE: 'trial-only-test-secret-1234567890123456789', TEST_EXPIRES_AT: new Date(Date.now() + 86400000).toISOString() };
  t.after(() => { db.close(); auth.close(); });
  const fetch = (path, options = {}) => worker.fetch(new Request(new URL(path, env.MCP_ORIGIN), options), env);
  const form = (path, body, headers = {}) => fetch(path, { method: 'POST', headers, body: new URLSearchParams(body) });
  async function grant(accessCode = env.TEST_ACCESS_CODE, scope = 'tg:personal') {
    const registration = await fetch('/register', { method: 'POST', body: JSON.stringify({ redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'], token_endpoint_auth_method: 'none' }) });
    assert.equal(registration.status, 201);
    const { client_id } = await registration.json();
    const verifier = 'x'.repeat(64);
    const parameters = { client_id, redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect', response_type: 'code', code_challenge_method: 'S256', code_challenge: await hash(verifier), resource: env.MCP_ORIGIN + '/mcp', scope, state: 'return-state' };
    const page = await fetch('/authorize?' + new URLSearchParams(parameters)); assert.equal(page.status, 200);
    assert.equal(page.headers.get('referrer-policy'), 'same-origin', 'Consent form must preserve browser Origin on same-site POST');
    assert.equal(page.headers.get('content-security-policy'), `default-src 'none'; form-action 'self' ${parameters.redirect_uri}; frame-ancestors 'none'; base-uri 'none'`);
    const cookie = page.headers.get('set-cookie').split(';')[0];
    const transaction = (await page.text()).match(/name="transaction" value="([^"]+)"/)[1];
    const approve = () => form('/authorize', { transaction, access_code: accessCode }, { origin: env.MCP_ORIGIN, cookie });
    return { parameters, client_id, verifier, approve, cookie, transaction };
  }
  async function token(accessCode = env.TEST_ACCESS_CODE, scope = 'tg:personal') {
    const g = await grant(accessCode, scope); const response = await g.approve(); assert.equal(response.status, 303);
    const target = new URL(response.headers.get('location')); assert.equal(target.searchParams.get('iss'), env.MCP_ORIGIN); assert.equal(target.searchParams.get('state'), 'return-state');
    const exchange = { grant_type: 'authorization_code', code: target.searchParams.get('code'), client_id: g.client_id, code_verifier: g.verifier, redirect_uri: g.parameters.redirect_uri, resource: g.parameters.resource };
    const r = await form('/token', exchange); assert.equal(r.status, 200);
    const tokens = await r.json(); return { access: tokens.access_token, refresh: tokens.refresh_token, exchange, grant: g };
  }
  return { db, auth, env, fetch, form, grant, token };
}

test('OAuth discovery, PKCE, resource binding, consent CSRF, and single-use codes', async t => {
  const f = fixture(t);
  const unauth = await f.fetch('/mcp', { method: 'POST', body: '{}' }); assert.equal(unauth.status, 401); assert.match(unauth.headers.get('www-authenticate'), /oauth-protected-resource/);
  const metadata = await (await f.fetch('/.well-known/oauth-authorization-server')).json(); assert.deepEqual(metadata.code_challenge_methods_supported, ['S256']);
  assert.equal((await f.fetch('/register', { method: 'POST', body: JSON.stringify({ redirect_uris: ['https://attacker.test/callback'] }) })).status, 400);
  const g = await f.grant();
  assert.equal((await f.form('/authorize', { transaction: g.transaction, access_code: f.env.TEST_ACCESS_CODE }, { origin: 'null', cookie: g.cookie })).status, 403);
  assert.equal((await f.form('/authorize', { transaction: g.transaction, access_code: f.env.TEST_ACCESS_CODE }, { origin: 'https://chatgpt.com', cookie: g.cookie })).status, 403);
  assert.equal((await f.form('/authorize', { transaction: g.transaction, access_code: f.env.TEST_ACCESS_CODE }, { origin: f.env.MCP_ORIGIN })).status, 403);
  assert.equal((await f.form('/authorize', { transaction: g.transaction, access_code: 'wrong' }, { origin: f.env.MCP_ORIGIN, cookie: g.cookie })).status, 403);
  const consent = await g.approve(); assert.equal(consent.status, 303); assert.equal((await g.approve()).status, 400);
  const exchange = { grant_type: 'authorization_code', code: new URL(consent.headers.get('location')).searchParams.get('code'), client_id: g.client_id, code_verifier: g.verifier, redirect_uri: g.parameters.redirect_uri, resource: g.parameters.resource };
  for (const change of [{ code_verifier: 'z'.repeat(64) }, { resource: 'https://other.test/mcp' }, { client_id: 'another' }, { redirect_uri: 'https://attacker.test' }]) assert.equal((await f.form('/token', { ...exchange, ...change })).status, 400);
  assert.equal((await f.form('/token', exchange)).status, 200); assert.equal((await f.form('/token', exchange)).status, 400);
  const second = await f.token();
  f.auth.exec("UPDATE oauth_records SET expires_at=0 WHERE kind='token'");
  assert.equal((await f.fetch('/mcp', { method: 'POST', headers: { authorization: `Bearer ${second.access}` }, body: '{}' })).status, 401);
});

test('separate consent tabs survive retries and clear only their own cookie', async t => {
  const f = fixture(t);
  const first = await f.grant(); const second = await f.grant();
  const firstName = first.cookie.split('=')[0]; const secondName = second.cookie.split('=')[0];
  assert.notEqual(firstName, secondName);
  const browserCookies = `${first.cookie}; ${second.cookie}`;
  const submit = (g, cookie) => f.form('/authorize', { transaction: g.transaction, access_code: f.env.TEST_ACCESS_CODE }, { origin: f.env.MCP_ORIGIN, cookie });
  // Another tab's valid cookie must not authorize this transaction.
  assert.equal((await submit(first, second.cookie)).status, 403);
  const approvedFirst = await submit(first, browserCookies);
  assert.equal(approvedFirst.status, 303);
  assert.ok(approvedFirst.headers.get('set-cookie').startsWith(firstName + '='));
  assert.match(approvedFirst.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await submit(second, second.cookie)).status, 303);
  assert.equal((await submit(first, first.cookie)).status, 400);
});

test('real MCP client discovers 26 tools and creates one audited card across retries', async t => {
  const f = fixture(t); const { access } = await f.token();
  const client = new Client({ name: 'deck-test', version: '1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(f.env.MCP_ORIGIN + '/mcp'), { requestInit: { headers: { Authorization: `Bearer ${access}` } }, fetch: (url, options) => f.fetch(url, options) });
  await client.connect(transport);
  try {
    const tools = await client.listTools(); assert.equal(tools.tools.length, 26); assert.equal(new Set(tools.tools.map(x => x.name)).size, 26); assert.ok(tools.tools.some(x => x.name === 'report_deck_moves')); for (const tool of tools.tools) assert.equal(typeof tool.annotations.readOnlyHint, 'boolean');
    const columns = await client.callTool({ name: 'list_deck_columns', arguments: {} });
    assert.deepEqual(columns.structuredContent.columns, [{ id: 'ideas', name: 'Ideas' }, { id: 'production', name: 'Production' }]);
    const args = { title: 'Mabra fall campaign — MCP test', client: 'Mabra', columnSourceId: 'ideas', notes: '<script>alert(1)</script>', requestId: crypto.randomUUID() };
    const created = await client.callTool({ name: 'create_deck_card', arguments: args }); assert.equal(created.isError, undefined); assert.equal(created.structuredContent.created, true); assert.match(created.structuredContent.url, /^https:\/\/deck.test\/app\/deck\?card=local-card-/);
    const again = await client.callTool({ name: 'create_deck_card', arguments: args }); assert.equal(again.structuredContent.id, created.structuredContent.id); assert.equal(again.structuredContent.created, false);
    const conflict = await client.callTool({ name: 'create_deck_card', arguments: { ...args, title: 'Different campaign' } }); assert.equal(conflict.isError, true);
    for (const columnSourceId of ['missing', 'archived']) assert.equal((await client.callTool({ name: 'create_deck_card', arguments: { ...args, requestId: crypto.randomUUID(), columnSourceId } })).isError, true);
    assert.equal((await client.callTool({ name: 'create_deck_card', arguments: { ...args, title: '', requestId: crypto.randomUUID() } })).isError, true);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM production_cards').get().n, 1);
    assert.equal(f.db.prepare('SELECT notes_html FROM production_card_overrides').get().notes_html, '&lt;script&gt;alert(1)&lt;/script&gt;');
    const audit = f.db.prepare('SELECT * FROM production_card_activity').get(); assert.equal(audit.actor_id, 'chatgpt-personal-mcp'); assert.equal(audit.event_type, 'card_created');
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM client_directory').get().n, 2);
  } finally { await client.close(); }
});

test('card writes roll back fully on database failure and retry can succeed', async t => {
  const f = fixture(t); const { access } = await f.token();
  const rpc = args => f.fetch('/mcp', { method: 'POST', headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_deck_card', arguments: args } }) });
  const args = { title: 'Rollback', columnSourceId: 'ideas', requestId: crypto.randomUUID() };
  f.db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON production_card_activity BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
  assert.equal((await (await rpc(args)).json()).result.isError, true);
  for (const table of ['production_cards', 'production_card_overrides', 'card_creation_requests']) assert.equal(f.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 0);
  f.db.exec('DROP TRIGGER fail_audit'); assert.equal((await (await rpc(args)).json()).result.structuredContent.created, true);
});

test('authentication fails closed for missing secret, hostile origins, and oversized requests', async t => {
  const f = fixture(t);
  assert.equal((await f.fetch('/mcp', { method: 'POST', headers: { origin: 'https://evil.test' }, body: '{}' })).status, 403);
  assert.equal((await f.fetch('/register', { method: 'POST', body: 'x'.repeat(32769) })).status, 413);
  f.env.TEST_ACCESS_CODE = ''; assert.equal((await f.fetch('/')).status, 503);
  f.env.TEST_ACCESS_CODE = 'x'.repeat(40); f.env.TEST_EXPIRES_AT = '2000-01-01'; assert.equal((await f.fetch('/')).status, 200, 'Legacy trial deadline no longer applies');
});

test('REST creation requires its dedicated scope and rejects revoked credentials', async t => {
  const f = fixture(t); const id = crypto.randomUUID(); const credential = `tg_${id}_${'x'.repeat(32)}`;
  const secretHash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(credential))).toString('hex');
  f.db.prepare('INSERT INTO api_integration_credentials(id,name,secret_hash,scopes_json,created_at) VALUES(?,?,?,?,?)').run(id, 'Test creator', secretHash, '["cards:read"]', 'now');
  const body = { title: 'API card', columnSourceId: 'ideas', requestId: crypto.randomUUID() };
  const call = (auth = credential, data = body) => onRequestPost({ env: f.env, request: new Request('https://deck.test/api/internal/v1/cards', { method: 'POST', headers: { authorization: `Bearer ${auth}` }, body: JSON.stringify(data) }) });
  assert.equal((await call('invalid')).status, 401); assert.equal((await call()).status, 403);
  f.db.prepare('UPDATE api_integration_credentials SET scopes_json=?').run('["cards:create"]');
  assert.equal((await call()).status, 201); assert.equal((await call()).status, 200);
  assert.equal((await call(credential, null)).status, 400);
  f.db.exec("UPDATE api_integration_credentials SET revoked_at='now'"); assert.equal((await call()).status, 401);
});

async function connected(f, t) {
  const { access } = await f.token();
  const client = new Client({ name: 'expanded-mcp-test', version: '1.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(f.env.MCP_ORIGIN + '/mcp'), { requestInit: { headers: { Authorization: `Bearer ${access}` } }, fetch: (url, options) => f.fetch(url, options) }));
  t.after(() => client.close());
  return async (name, args = {}) => client.callTool({ name, arguments: args });
}

test('client item retries are durable; partial edits preserve rich body and detect stale writes', async t => {
  const f = fixture(t), call = await connected(f, t);
  const args = { clientId: 'bmw', kind: 'todo', title: 'Create a contract', body: 'Keep details', assignee: 'Taylor', dueOn: '2026-12-01', requestId: crypto.randomUUID() };
  const first = await call('create_client_item', args); assert.equal(first.isError, undefined);
  const itemId = first.structuredContent.id;
  const retry = await call('create_client_item', args); assert.equal(retry.structuredContent.id, itemId); assert.equal(retry.structuredContent.created, false);
  assert.equal((await call('create_client_item', { ...args, title: 'Different' })).isError, true);
  assert.equal((await call('create_client_item', { ...args, requestId: crypto.randomUUID(), assignee: 'Unknown' })).isError, true);
  assert.equal((await call('create_client_item', { ...args, requestId: crypto.randomUUID(), dueOn: '2026-02-30' })).isError, true);
  f.db.prepare("UPDATE client_workspace_items SET body='<p>Rich</p>',body_format='html',body_json='{}',updated_at='2026-01-01T00:00:00Z' WHERE id=?").run(itemId);
  let item = f.db.prepare('SELECT * FROM client_workspace_items WHERE id=?').get(itemId);
  const updated = await call('update_client_item', { clientId: 'bmw', itemId, expectedUpdatedAt: item.updated_at, title: 'Draft a contract' }); assert.equal(updated.isError, undefined);
  assert.equal(updated.structuredContent.item.body, '<p>Rich</p>'); assert.equal(updated.structuredContent.item.body_format, 'html'); assert.equal(updated.structuredContent.item.assignee, 'Taylor');
  assert.equal((await call('set_client_todo_completed', { clientId: 'bmw', itemId, expectedUpdatedAt: item.updated_at, completed: true })).isError, true);
  item = updated.structuredContent.item;
  const completed = await call('set_client_todo_completed', { clientId: 'bmw', itemId, expectedUpdatedAt: item.updated_at, completed: true }); assert.equal(completed.isError, undefined); assert.equal(completed.structuredContent.item.completed, 1); assert.equal(completed.structuredContent.item.due_on, '2026-12-01');
  const deleted = await call('delete_client_item', { clientId: 'bmw', itemId, expectedUpdatedAt: completed.structuredContent.item.updated_at }); assert.equal(deleted.isError, undefined);
  assert.equal((await call('create_client_item', args)).structuredContent.created, false, 'Retry after deletion must not resurrect the item');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM client_workspace_items').get().n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM client_activity').get().n, 4);
});

test('client create and audit roll back atomically on failure', async t => {
  const f = fixture(t), call = await connected(f, t);
  const args = { clientId: 'bmw', kind: 'note', title: 'Brief', requestId: crypto.randomUUID() };
  f.db.exec("CREATE TRIGGER fail_client_audit BEFORE INSERT ON client_activity BEGIN SELECT RAISE(ABORT,'fixture'); END;");
  assert.equal((await call('create_client_item', args)).isError, true);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM mcp_item_requests').get().n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM client_workspace_items').get().n, 0);
  f.db.exec('DROP TRIGGER fail_client_audit'); assert.equal((await call('create_client_item', args)).structuredContent.created, true);
});

test('calendar reporting uses Eastern boundaries, excludes reorders, counts repeat moves and deleted cards', async t => {
  const f = fixture(t), call = await connected(f, t);
  const created = await call('create_deck_card', { title: 'Campaign', columnSourceId: 'ideas', requestId: crypto.randomUUID() });
  const cardId = created.structuredContent.id;
  const sourceId = f.db.prepare('SELECT source_id FROM production_cards WHERE id=?').get(cardId).source_id;
  const insert = f.db.prepare('INSERT INTO production_card_edit_log(id,card_source_id,changed_at,actor,before_json,after_json) VALUES(?,?,?,?,?,?)');
  for (const [date,from,to] of [
    ['2026-11-01T03:59:59Z','ideas','production'], // October in New York
    ['2026-11-01T04:00:00Z','ideas','production'],
    ['2026-11-05T12:00:00Z','production','production'], // reorder
    ['2026-11-06T12:00:00Z','production','ideas'],
    ['2026-12-01T04:59:59Z','ideas','production'], // still November
    ['2026-12-01T05:00:00Z','ideas','production'], // December
  ]) insert.run(crypto.randomUUID(),sourceId,date,'Taylor',JSON.stringify({columnSourceId:from}),JSON.stringify({columnSourceId:to}));
  f.db.prepare("UPDATE production_card_overrides SET deleted_at='now' WHERE card_source_id=?").run(sourceId);
  const report = await call('report_deck_moves', { columnSourceId:'production',fromDate:'2026-11-01',toDate:'2026-12-01',limit:1 });
  assert.equal(report.isError, undefined); assert.equal(report.structuredContent.moveCount,2); assert.equal(report.structuredContent.uniqueCardCount,1); assert.equal(report.structuredContent.nextOffset,1); assert.equal(report.structuredContent.events[0].deleted,true);
  assert.equal((await call('report_deck_moves',{columnSourceId:'production',timeZone:'Mars/Test'})).isError,true);
  assert.equal((await call('search_deck_cards')).structuredContent.data.length,0);
  for (const name of ['get_deck_card','get_deck_card_activity','move_deck_card','add_deck_comment','link_video_to_card']) {
    assert.equal((await call(name,{cardId,columnSourceId:'production',body:'No',assetId:'abc123'})).isError,true,name);
  }
});

test('old narrow OAuth grants cannot gain expanded personal access', async t => {
  const f=fixture(t); const {access}=await f.token();
  const row=f.auth.prepare("SELECT id,data FROM oauth_records WHERE kind='token'").get();
  f.auth.prepare("UPDATE oauth_records SET data=? WHERE kind='token' AND id=?").run(JSON.stringify({...JSON.parse(row.data),scope:'deck:create'}),row.id);
  assert.equal((await f.fetch('/mcp',{method:'POST',headers:{authorization:`Bearer ${access}`},body:'{}'})).status,401);
  const grant=await f.grant();
  assert.equal((await f.fetch('/authorize?'+new URLSearchParams({...grant.parameters,scope:'deck:create'}))).status,400);
});

test('video tools search newest uploads, return public links and refuse private playback', async t => {
  const f=fixture(t), call=await connected(f,t);
  f.db.exec(`CREATE TABLE mux_asset_metadata(asset_id TEXT,client TEXT,title TEXT,tags TEXT,status TEXT,thumbnail_time REAL,downloads_enabled INTEGER);
    CREATE TABLE mux_video_projects(value TEXT,updated_at TEXT);
    CREATE TABLE mux_video_collections(value TEXT,updated_at TEXT);
    CREATE TABLE archive_imports(asset_id TEXT,vimeo_id TEXT,upload_id TEXT);
    CREATE TABLE archive_videos(vimeo_id TEXT,title TEXT,created_at TEXT,client TEXT,folder TEXT);
    INSERT INTO mux_asset_metadata VALUES('newvideo','VGA','VGA fall','[]','published',NULL,1),('oldvideo','VGA','VGA spring','[]','published',NULL,1);`);
  f.db.prepare('INSERT INTO mux_library_snapshot_state VALUES(?,?,?)').run('library','fixture',new Date().toISOString());
  for(const [id,date] of [['oldvideo','2026-04-01'],['newvideo','2026-11-01']]) f.db.prepare("INSERT INTO mux_library_assets(asset_id,refresh_id,value,refreshed_at) VALUES(?,?,?,'now')").run(id,'fixture',JSON.stringify({id,title:id,createdAt:date,duration:30,playbackId:'play'+id,playbackPolicy:'public',thumbnailUrl:null}));
  const search=await call('search_videos',{client:'VGA',limit:1}); assert.equal(search.isError,undefined); assert.equal(search.structuredContent.data[0].id,'newvideo');
  const next=await call('search_videos',{client:'VGA',limit:1,cursor:search.structuredContent.meta.nextCursor}); assert.equal(next.structuredContent.data[0].id,'oldvideo');
  f.env.MUX_TOKEN_ID='fixture';f.env.MUX_TOKEN_SECRET='fixture';
  const originalFetch=globalThis.fetch;
  const requests=[];
  globalThis.fetch=async(url,options)=>{ requests.push([String(url),options?.method||'GET']);const id=String(url).split('/').at(-1);return Response.json({data:{id,status:'ready',created_at:'1793491200',duration:30,playback_ids:[{id:'play'+id,policy:id==='privatevideo'?'signed':'public'}],meta:{title:'VGA fall'}}});};
  try {
    const link=await call('get_video_share_link',{assetIdOrSlug:'newvideo'}); assert.equal(link.isError,undefined);assert.equal(link.structuredContent.url,'https://deck.test/watch/u/newvideo');
    assert.equal((await call('get_video_share_link',{assetIdOrSlug:'privatevideo'})).isError,true);
    const card=await call('create_deck_card',{title:'Link fixture',columnSourceId:'ideas',requestId:crypto.randomUUID()});
    const linked=await call('link_video_to_card',{cardId:card.structuredContent.id,assetId:'newvideo'});assert.equal(linked.isError,undefined);assert.equal(linked.structuredContent.data.created,true);
    const replay=await call('link_video_to_card',{cardId:card.structuredContent.id,assetId:'newvideo'});assert.equal(replay.structuredContent.data.created,false);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM production_card_activity WHERE event_type='video_linked'").get().n,1);
    assert.ok(requests.every(([url,method])=>url.startsWith('https://api.mux.com/video/v1/assets/')&&method==='GET'));
  } finally {globalThis.fetch=originalFetch;}
});

test('previous-scope consent and authorization codes are rejected after expansion', async t => {
  const f=fixture(t),g=await f.grant();
  const pending=f.auth.prepare("SELECT id,data FROM oauth_records WHERE kind='pending'").get();
  f.auth.prepare("UPDATE oauth_records SET data=? WHERE kind='pending' AND id=?").run(JSON.stringify({...JSON.parse(pending.data),scope:'deck:create'}),pending.id);
  assert.equal((await g.approve()).status,400);
  const fresh=await f.grant(); const response=await fresh.approve();
  const row=f.auth.prepare("SELECT id,data FROM oauth_records WHERE kind='code'").get();
  f.auth.prepare("UPDATE oauth_records SET data=? WHERE kind='code' AND id=?").run(JSON.stringify({...JSON.parse(row.data),scope:'deck:create'}),row.id);
  assert.equal((await f.form('/token',{grant_type:'authorization_code',code:new URL(response.headers.get('location')).searchParams.get('code'),client_id:fresh.client_id,code_verifier:fresh.verifier,redirect_uri:fresh.parameters.redirect_uri,resource:fresh.parameters.resource})).status,400);
});


test('existing card movement and comments retain validation and audit attribution', async t => {
  const f=fixture(t),call=await connected(f,t);
  const created=await call('create_deck_card',{title:'Move fixture',columnSourceId:'ideas',requestId:crypto.randomUUID()});
  const cardId=created.structuredContent.id;
  const moved=await call('move_deck_card',{cardId,columnSourceId:'production'});assert.equal(moved.isError,undefined);assert.equal(moved.structuredContent.data.columnSourceId,'production');
  assert.equal(f.db.prepare('SELECT actor FROM production_card_edit_log').get().actor,'ChatGPT personal MCP');
  const comment=await call('add_deck_comment',{cardId,body:'Please review <script>text</script>'});assert.equal(comment.isError,undefined);
  assert.equal(comment.structuredContent.data.authorName,'ChatGPT personal MCP');assert.ok(!comment.structuredContent.data.bodyHtml.includes('<script>'));
  const detail=await call('get_deck_card',{cardId});assert.equal(detail.structuredContent.data.columnSourceId,'production');
  const history=await call('get_deck_card_activity',{cardId});assert.ok(history.structuredContent.data.some(e=>e.type==='comment_added'));
});


test('refresh survives the old deadline and a year of inactivity; rotates and revokes on replay', async t => {
  const f=fixture(t), issued=await f.token(); assert.ok(issued.refresh);
  const metadata=await (await f.fetch('/.well-known/oauth-authorization-server')).json();
  assert.ok(metadata.grant_types_supported.includes('refresh_token'));assert.equal(metadata.revocation_endpoint,f.env.MCP_ORIGIN+'/revoke');
  const realNow=Date.now; Date.now=()=>realNow()+400*86400000;
  try {
    const rpc=token=>f.fetch('/mcp',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
    assert.equal((await rpc(issued.access)).status,401);
    const body={grant_type:'refresh_token',refresh_token:issued.refresh,client_id:issued.grant.client_id};
    for(const change of [{client_id:'wrong'},{resource:'https://wrong.test/mcp'},{scope:'admin'}]) assert.equal((await f.form('/token',{...body,...change})).status,400);
    const renewed=await f.form('/token',body);assert.equal(renewed.status,200);
    const tokens=await renewed.json(); assert.notEqual(tokens.refresh_token,issued.refresh);assert.equal(tokens.expires_in,3600);
    assert.equal((await rpc(tokens.access_token)).status,200);
    assert.equal((await f.form('/token',body)).status,400,'Replayed refresh rejected');
    assert.equal((await rpc(tokens.access_token)).status,401,'Replay revokes the entire connection');
    assert.equal((await f.form('/token',{...body,refresh_token:tokens.refresh_token})).status,400);
  } finally {Date.now=realNow;}
});

test('revocation binds client and invalidates all tokens only for the target connection', async t => {
  const f=fixture(t),a=await f.token(),b=await f.token();
  const refresh=x=>f.form('/token',{grant_type:'refresh_token',refresh_token:x.refresh,client_id:x.grant.client_id,resource:f.env.MCP_ORIGIN+'/mcp',scope:'tg:personal'});
  assert.equal((await f.form('/revoke',{token:a.refresh,client_id:b.grant.client_id})).status,200);
  const renewed=await refresh(a);assert.equal(renewed.status,200);
  const tokens=await renewed.json();
  assert.equal((await f.form('/revoke',{token:tokens.access_token,client_id:a.grant.client_id})).status,200);
  assert.equal((await refresh({...a,refresh:tokens.refresh_token})).status,400);
  assert.equal((await refresh(b)).status,200);
  assert.equal((await f.form('/revoke',{token:'unknown',client_id:a.grant.client_id})).status,200);
});

test('refresh rotation rolls back on storage failure without losing the valid refresh token', async t => {
  const f=fixture(t),issued=await f.token();
  const body={grant_type:'refresh_token',refresh_token:issued.refresh,client_id:issued.grant.client_id};
  f.auth.exec("CREATE TRIGGER fail_refresh BEFORE INSERT ON oauth_records WHEN NEW.kind='token' BEGIN SELECT RAISE(ABORT,'fixture'); END;");
  assert.equal((await f.form('/token',body)).status,500);
  f.auth.exec('DROP TRIGGER fail_refresh');
  assert.equal((await f.form('/token',body)).status,200);
});

test('cleanup removes revoked token families without removing persistent active grants', async t => {
  const f=fixture(t),a=await f.token(),b=await f.token();
  await f.form('/revoke',{token:a.refresh,client_id:a.grant.client_id});
  await worker.scheduled({},f.env);
  assert.equal(f.auth.prepare("SELECT COUNT(*) n FROM oauth_records WHERE kind='refresh'").get().n,1);
  assert.equal((await f.form('/token',{grant_type:'refresh_token',refresh_token:b.refresh,client_id:b.grant.client_id})).status,200);
});


function management(f) {
  f.db.prepare('INSERT INTO admin_sessions VALUES(?,?,?,?)').run('owner','Tyler','tyler@trantergrey.com','2099-01-01');
  f.db.prepare('INSERT INTO admin_sessions VALUES(?,?,?,?)').run('teammate','Taylor','taylor@trantergrey.com','2099-01-01');
  return (body, user='owner', origin=f.env.DECK_ORIGIN) => manageConnections({env:f.env,request:new Request(f.env.DECK_ORIGIN+'/api/admin/mcp-connections',{method:body?'POST':'GET',headers:{cookie:`tg_admin=${user}`,origin},...(body?{body:JSON.stringify(body)}:{})})});
}

test('only access owner can manage invitations; codes are returned once and hashed',async t=>{
  const f=fixture(t),api=management(f);
  for(const user of ['missing','teammate']) {
    assert.equal((await api(undefined,user)).status,user==='missing'?401:403);
    assert.equal((await api({action:'invite',email:'taylor@trantergrey.com',requestId:crypto.randomUUID()},user)).status,user==='missing'?401:403);
  }
  assert.equal((await api({action:'invite'},'owner','https://evil.test')).status,403);
  const body={action:'invite',email:'taylor@trantergrey.com',requestId:crypto.randomUUID()};
  assert.equal((await api({...body,email:'outsider@example.com'})).status,400);
  const response=await api(body);assert.equal(response.status,201);const {code,invitation}=await response.json();
  assert.match(code,/^TG-[A-F0-9]{32}$/);
  const stored=f.auth.prepare('SELECT * FROM mcp_invitations WHERE id=?').get(invitation.id);assert.equal(stored.code_hash,await hash(code));assert.ok(!JSON.stringify(stored).includes(code));
  assert.equal((await api(body)).status,409);
  const listed=await (await api()).json();assert.equal(listed.invitations.length,1);assert.ok(!JSON.stringify(listed).includes(code));assert.ok(!JSON.stringify(listed).includes(stored.code_hash));
  assert.equal((await api({action:'revoke-invitation',id:invitation.id},'teammate')).status,403);
});

test('teammate code is single-use, grants survive renewal, actions identify teammate, owner revokes independently',async t=>{
  const f=fixture(t),api=management(f),owner=await f.token();
  const invitation=await (await api({action:'invite',email:'taylor@trantergrey.com',requestId:crypto.randomUUID()})).json();
  const member=await f.token(invitation.code);
  const second=await f.grant(invitation.code);assert.equal((await second.approve()).status,403);
  const client=new Client({name:'member-test',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL(f.env.MCP_ORIGIN+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${member.access}`}},fetch:(url,opts)=>f.fetch(url,opts)}));t.after(()=>client.close());
  const call=(name,args)=>client.callTool({name,arguments:args});
  const card=await call('create_deck_card',{title:'Member campaign',columnSourceId:'ideas',requestId:crypto.randomUUID()});assert.equal(card.isError,undefined);
  const audit=f.db.prepare("SELECT actor_id FROM production_card_activity WHERE event_type='card_created'").get();assert.equal(audit.actor_id,'mcp-invitation:'+invitation.invitation.id);
  const comment=await call('add_deck_comment',{cardId:card.structuredContent.id,body:'From teammate'});assert.equal(comment.structuredContent.data.authorName,'Taylor (MCP)');assert.equal(comment.structuredContent.data.authorEmail,'taylor@trantergrey.com');
  const todo=await call('create_client_item',{clientId:'bmw',kind:'todo',title:'Member todo',requestId:crypto.randomUUID()});assert.equal(todo.isError,undefined);assert.equal(f.db.prepare('SELECT actor FROM client_activity').get().actor,'Taylor (MCP)');
  const renewed=await f.form('/token',{grant_type:'refresh_token',refresh_token:member.refresh,client_id:member.grant.client_id});assert.equal(renewed.status,200);const tokens=await renewed.json();
  const before=await (await api()).json();assert.equal(before.invitations[0].connectionCount,1);assert.ok(before.invitations[0].lastUsedAt);
  await api({action:'revoke-invitation',id:invitation.invitation.id});
  assert.equal((await f.fetch('/mcp',{method:'POST',headers:{authorization:`Bearer ${tokens.access_token}`},body:'{}'})).status,401);
  assert.equal((await f.form('/token',{grant_type:'refresh_token',refresh_token:tokens.refresh_token,client_id:member.grant.client_id})).status,400);
  assert.equal((await f.form('/token',{grant_type:'refresh_token',refresh_token:owner.refresh,client_id:owner.grant.client_id})).status,200);
});

test('expired or revoked invitations cannot be redeemed; revoke after consent blocks code exchange',async t=>{
  const f=fixture(t),api=management(f);
  const create=async()=> (await api({action:'invite',email:'taylor@trantergrey.com',requestId:crypto.randomUUID()})).json();
  const expired=await create();f.auth.prepare('UPDATE mcp_invitations SET expires_at=0 WHERE id=?').run(expired.invitation.id);
  assert.equal((await (await f.grant(expired.code)).approve()).status,403);
  const revoked=await create();await api({action:'revoke-invitation',id:revoked.invitation.id});assert.equal((await (await f.grant(revoked.code)).approve()).status,403);
  const pending=await create(),g=await f.grant(pending.code);const approved=await g.approve();assert.equal(approved.status,303);
  await api({action:'revoke-invitation',id:pending.invitation.id});
  const exchange={grant_type:'authorization_code',code:new URL(approved.headers.get('location')).searchParams.get('code'),client_id:g.client_id,code_verifier:g.verifier,redirect_uri:g.parameters.redirect_uri,resource:g.parameters.resource};
  assert.equal((await f.form('/token',exchange)).status,400);
});

function sessionRequest(f, body, path='/api/internal/v1/client-hq', owner=true) {
  const email=owner?'tyler@trantergrey.com':'taylor@trantergrey.com';
  f.db.prepare('INSERT INTO admin_sessions VALUES(?,?,?,?)').run(crypto.randomUUID(),'unused',email,'2000');
  f.db.prepare('INSERT INTO admin_sessions VALUES(?,?,?,?)').run('shared-session','Taylor',email,'9999');
  return new Request('https://deck.test'+path,{method:body===undefined?'GET':'POST',headers:{cookie:'tg_admin=shared-session',origin:'https://deck.test','content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
test('HTTP and MCP share rich-note preservation, conflict checks, validation and deletion',async t=>{
  const f=fixture(t); const {access}=await f.token();
  const call=async(name,args)=>(await(await f.fetch('/mcp',{method:'POST',headers:{authorization:`Bearer ${access}`,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})})).json()).result;
  const http=body=>clientHQApi({request:sessionRequest(f,body),env:f.env});
  const rich=JSON.stringify([{type:'paragraph',children:[{text:'Keep this formatting',bold:true}]}]);
  const create={workspace_id:'bmw',kind:'note',title:'Rich note',body:'',body_format:'html',body_json:rich,requestId:crypto.randomUUID()};
  const made=await http(create); assert.equal(made.status,200);const {data:{id}}=await made.json();
  const retry=await http(create);assert.equal(retry.status,200);assert.equal((await retry.json()).data.id,id);
  assert.equal((await http({...create,title:'Changed retry'})).status,409);
  let item=f.db.prepare('SELECT * FROM client_workspace_items WHERE id=?').get(id);
  assert.equal(item.body_json,rich);assert.match(item.body,/<strong>/);
  const stale=item.updated_at;
  const edited=await call('update_client_item',{clientId:'bmw',itemId:id,title:'MCP title',expectedUpdatedAt:stale});assert.equal(edited.isError,undefined);
  assert.equal((await http({workspace_id:'bmw',id,title:'stale website',expectedUpdatedAt:stale})).status,409);
  assert.equal((await http({workspace_id:'bmw',id,title:'missing version'})).status,428);
  item=f.db.prepare('SELECT * FROM client_workspace_items WHERE id=?').get(id);assert.equal(item.body_json,rich);
  const current=item.updated_at;
  assert.equal((await http({workspace_id:'bmw',id,expectedUpdatedAt:current,due_on:'2026-02-30'})).status,400);
  assert.equal((await http({workspace_id:'bmw',id,expectedUpdatedAt:current,assignee:'Nobody'})).status,400);
  // The normal website submits the full rich note including completed:0.
  assert.equal((await http({...item,title:'Website edit',expectedUpdatedAt:current})).status,200);
  const conflict=await call('update_client_item',{clientId:'bmw',itemId:id,title:'stale MCP',expectedUpdatedAt:current});assert.equal(conflict.isError,true);
  item=f.db.prepare('SELECT * FROM client_workspace_items WHERE id=?').get(id);assert.equal(item.title,'Website edit');assert.equal(item.body_json,rich);
  assert.equal((await http({workspace_id:'bmw',id,action:'delete',expectedUpdatedAt:stale})).status,409);
  assert.equal((await http({workspace_id:'bmw',id,action:'delete',expectedUpdatedAt:item.updated_at})).status,200);
  const noResurrection=await http(create);assert.equal(noResurrection.status,200);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM client_workspace_items').get().n,0);
});
test('admin UI shares item commands and failed audit rolls back REST creation',async t=>{
  const f=fixture(t);
  const args={workspace_id:'bmw',kind:'todo',title:'Contract',due_on:'2026-12-01',assignee:'Taylor',requestId:crypto.randomUUID()};
  const http=body=>clientHQAdmin({request:sessionRequest(f,body,'/api/admin/client-hq'),env:f.env});
  f.db.exec("CREATE TRIGGER fail_item_audit BEFORE INSERT ON client_activity BEGIN SELECT RAISE(ABORT,'private-error-payload'); END;");
  await assert.rejects(http(args)); assert.equal(f.db.prepare('SELECT COUNT(*) n FROM client_workspace_items').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM mcp_item_requests').get().n,0);
  f.db.exec('DROP TRIGGER fail_item_audit');const created=await http(args);assert.equal(created.status,200);const{id}=await created.json();
  let item=f.db.prepare('SELECT * FROM client_workspace_items WHERE id=?').get(id);
  f.db.exec('DELETE FROM admin_team_directory');
  const completed=await http({...item,completed:1,expectedUpdatedAt:item.updated_at});assert.equal(completed.status,200,'Historical assignment can be retained');
  item=f.db.prepare('SELECT * FROM client_workspace_items WHERE id=?').get(id);assert.equal(item.completed,1);assert.ok(item.completed_at);assert.equal(item.due_on,'2026-12-01');
});
test('global rate limiter blocks bursts, isolates actors, rolls windows and cleans expired storage',async t=>{
  const f=fixture(t);const dateNow=Date.now;let time=1800000000000;Date.now=()=>time;t.after(()=>{Date.now=dateNow;});
  const responses=await Promise.all(Array.from({length:7},()=>enforceRateLimit(f.env,'api','test','actor-a',3)));
  assert.equal(responses.filter(Boolean).length,4);assert.equal(responses.find(Boolean).status,429);assert.equal(responses.find(Boolean).headers.get('retry-after'),'60');
  assert.equal(await enforceRateLimit(f.env,'api','test','actor-b',3),null);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM integration_events WHERE category='rate_limited'").get().n,1);
  assert.ok(!JSON.stringify(f.db.prepare('SELECT * FROM integration_rate_limits').all()).includes('actor-a'));
  time+=60000;assert.equal(await enforceRateLimit(f.env,'api','test','actor-a',3),null);
  time+=31*86400000;await cleanupIntegrationHealth(f.env);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM integration_rate_limits').get().n,0);
});
test('MCP limits public registration and authenticated requests without changing tool permissions',async t=>{
  const f=fixture(t);const {access}=await f.token();
  for(let i=1;i<20;i++)assert.equal((await f.fetch('/register',{method:'POST',body:JSON.stringify({redirect_uris:['https://chatgpt.com/connector_platform_oauth_redirect']})})).status,201);
  const denied=await f.fetch('/register',{method:'POST',body:'{}'});assert.equal(denied.status,429);assert.ok(Number(denied.headers.get('retry-after'))>0);
  await enforceRateLimit(f.env,'mcp','authenticated','chatgpt-personal-mcp',300);
  f.db.exec('UPDATE integration_rate_limits SET hits=300');
  const blocked=await f.fetch('/mcp',{method:'POST',headers:{authorization:`Bearer ${access}`},body:'{}'});assert.equal(blocked.status,429);
});
test('API middleware monitors caught and uncaught failures without recording secrets',async t=>{
  const f=fixture(t);const request=sessionRequest(f,undefined,'/api/internal/v1/cards/private-client-name?code=SECRET');
  const run=next=>integrationRequest({request,env:f.env,next});
  const response=await run(async()=>{throw new Error('SECRET token=TOPSECRET');});assert.equal(response.status,503);assert.ok(response.headers.get('x-request-id'));
  const handled=await run(async()=>Response.json({error:'SECRET database details'},{status:502}));assert.equal(handled.status,502);assert.ok(!(await handled.text()).includes('SECRET'));
  const events=f.db.prepare('SELECT * FROM integration_events').all();assert.equal(events.length,2);assert.equal(events[0].operation,'cards/detail');assert.ok(!JSON.stringify(events).includes('SECRET'));assert.ok(!JSON.stringify(events).includes('private-client-name'));
  const invalid=await run(async()=>Response.json({error:'Bad input'},{status:400}));assert.equal(invalid.status,400);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM integration_events').get().n,2);
  f.db.exec('DROP TABLE integration_rate_limits');const failClosed=await run(async()=>Response.json({ok:true}));assert.equal(failClosed.status,503);
});
test('monitoring catches MCP HTTP-200 tool failures and is owner-only',async t=>{
  const f=fixture(t);const{access}=await f.token();
  f.db.exec("CREATE TRIGGER fail_audit_health BEFORE INSERT ON production_card_activity BEGIN SELECT RAISE(ABORT,'SECRET'); END;");
  const response=await f.fetch('/mcp',{method:'POST',headers:{authorization:`Bearer ${access}`,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'create_deck_card',arguments:{title:'secret title',columnSourceId:'ideas',requestId:crypto.randomUUID()}}})});assert.equal(response.status,200);assert.equal((await response.json()).result.isError,true);
  const event=f.db.prepare('SELECT * FROM integration_events').get();assert.equal(event.operation,'create_deck_card');assert.ok(!JSON.stringify(event).includes('secret title'));
  assert.equal((await healthApi({request:new Request('https://deck.test/api/admin/integration-health'),env:f.env})).status,401);
  assert.equal((await healthApi({request:sessionRequest(f,undefined,'/api/admin/integration-health',false),env:f.env})).status,403);
  f.db.exec('DELETE FROM admin_sessions');const read=await healthApi({request:sessionRequest(f,undefined,'/api/admin/integration-health'),env:f.env});assert.equal(read.status,200);assert.equal((await read.json()).events.length,1);
});

test('comment reader merges imported/local pages, excludes deleted records and isolates cards',async t=>{
  const f=fixture(t);const{access}=await f.token();
  const call=async(name,args)=>(await(await f.fetch('/mcp',{method:'POST',headers:{authorization:`Bearer ${access}`,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})})).json()).result;
  const created=await call('create_deck_card',{title:'Comment test',columnSourceId:'ideas',requestId:crypto.randomUUID()});const cardId=created.structuredContent.id;
  const source=f.db.prepare('SELECT source_id FROM production_cards WHERE id=?').get(cardId).source_id;
  const local=(id,html,json=null,deleted=null)=>f.db.prepare('INSERT INTO production_local_comments(id,card_source_id,body_html,body_json,author_name,created_at,deleted_at) VALUES(?,?,?,?,?,?,?)').run(id,source,html,json,'Taylor','2026-11-22T12:00:00Z',deleted);
  const group=[{type:'mux-asset',assetId:'group-not-an-asset',itemKind:'ratio-group',href:'/watch/campaign',media:[{id:'assetOne',playerUrl:'https://player.mux.com/playOne?token=secret'},{id:'assetTwo',playerUrl:'https://player.mux.com/playTwo'}],children:[{text:''}]}];
  local('same','<p>Group review</p>',JSON.stringify(group));
  local('z','<p>Second local</p>');local('deleted','<p>Deleted secret</p>',null,'now');
  f.db.prepare('INSERT INTO production_comments(source_id,card_source_id,body_html,author_json,created_at,source_json,imported_at) VALUES(?,?,?,?,?,?,?)').run('same',source,'<p>Imported review &amp; notes</p><iframe src="https://player.mux.com/oldPlayback?token=hidden"></iframe>','{"name":"Imported Author"}','2026-11-22T12:00:00Z','{}','now');
  f.db.prepare('INSERT INTO mux_library_snapshot_state VALUES(?,?,?)').run('library','refresh','now');
  f.db.prepare('INSERT INTO mux_library_assets VALUES(?,?,?,?)').run('oldAsset','refresh',JSON.stringify({id:'oldAsset',playbackId:'oldPlayback'}),'now');
  let cursor,all=[];
  do {const page=await call('get_deck_card_comments',{cardId,limit:1,...(cursor?{cursor}:{})});assert.equal(page.isError,undefined);all.push(...page.structuredContent.data);cursor=page.structuredContent.meta.nextCursor;}while(cursor);
  assert.equal(all.length,3);assert.equal(new Set(all.map(c=>c.id)).size,3);assert.ok(!JSON.stringify(all).includes('Deleted secret'));
  const imported=all.find(c=>c.source==='imported');assert.equal(imported.authorName,'Imported Author');assert.deepEqual(imported.assetIds,['oldAsset']);assert.equal(imported.text,'Imported review & notes');assert.ok(!JSON.stringify(imported.mediaLinks).includes('token='));
  const grouped=all.find(c=>c.id==='local:same');assert.deepEqual(grouped.assetIds,['assetOne','assetTwo']);assert.ok(!grouped.assetIds.includes('group-not-an-asset'));assert.deepEqual(grouped.unresolvedPlaybackIds,['playOne','playTwo']);assert.deepEqual(grouped.watchLinks,['https://trantergrey.com/watch/campaign']);
  const page=await call('get_deck_card_comments',{cardId,limit:1});
  const other=(await call('create_deck_card',{title:'Other',columnSourceId:'ideas',requestId:crypto.randomUUID()})).structuredContent.id;
  assert.equal((await call('get_deck_card_comments',{cardId:other,cursor:page.structuredContent.meta.nextCursor})).isError,true);
  assert.deepEqual((await call('get_deck_card_comments',{cardId:other})).structuredContent.data,[]);
  const http=(headers={},query='')=>readComments({request:new Request('https://deck.test/api/internal/v1/cards/'+cardId+'/comments'+query,{headers}),env:f.env,params:{id:cardId}});
  assert.equal((await http()).status,401);
  const credentialId=crypto.randomUUID(), credential=`tg_${credentialId}_${'x'.repeat(32)}`;
  const digest=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(credential))).toString('hex');
  f.db.prepare('INSERT INTO api_integration_credentials(id,name,secret_hash,scopes_json,created_at) VALUES(?,?,?,?,?)').run(credentialId,'Comment reader',digest,'["cards:write"]','now');
  assert.equal((await http({authorization:`Bearer ${credential}`})).status,403);
  f.db.prepare('UPDATE api_integration_credentials SET scopes_json=? WHERE id=?').run('["cards:read"]',credentialId);
  assert.equal((await http({authorization:`Bearer ${credential}`})).status,200);
  f.db.prepare('UPDATE api_integration_credentials SET revoked_at=? WHERE id=?').run('now',credentialId);
  assert.equal((await http({authorization:`Bearer ${credential}`})).status,401);
  sessionRequest(f,undefined);
  assert.equal((await http({cookie:'tg_admin=shared-session'},'?limit=0')).status,400);
  assert.equal((await http({cookie:'tg_admin=shared-session'},'?cursor=garbage')).status,400);
  const rest=await http({cookie:'tg_admin=shared-session'});assert.equal(rest.status,200);assert.deepEqual((await rest.json()).data,all);
  f.db.prepare('UPDATE production_card_overrides SET deleted_at=? WHERE card_source_id=?').run('now',source);
  assert.equal((await http({cookie:'tg_admin=shared-session'})).status,404);
});
test('comment extraction flags malformed content and never guesses IDs from text, titles or hostile URLs',async t=>{
  const f=fixture(t);f.db.prepare("INSERT INTO production_cards(id,source_id,title,column_source_id,source_json,imported_at) VALUES(?,?,?,?,'{}','now')").run('card','source','Card','ideas');
  f.db.prepare('INSERT INTO production_local_comments(id,card_source_id,body_html,body_json,author_name,created_at) VALUES(?,?,?,?,?,?)').run('malformed','source','<p>assetLooksReal is just text</p><script>https://player.mux.com/scriptOnly</script><iframe src="https://player.mux.com.evil.test/fake"></iframe><a href="https://trantergrey.com.evil.test/watch/fake">Fake</a><a href="/watch/u/a-project">Real project link</a><video src="https://stream.mux.com/unknownPlayback.m3u8?token=secret"></video>','{broken','Taylor','2026-11-22');
  const request=sessionRequest(f,undefined,'/api/internal/v1/cards/card/comments');
  const response=await readComments({request,env:f.env,params:{id:'card'}});assert.equal(response.status,200);
  const{data:[comment]}=await response.json();assert.deepEqual(comment.assetIds,[]);assert.deepEqual(comment.playbackIds,['unknownPlayback']);assert.deepEqual(comment.unresolvedPlaybackIds,['unknownPlayback']);assert.deepEqual(comment.warnings,['invalid_structured_content']);assert.deepEqual(comment.watchLinks,['https://trantergrey.com/watch/u/a-project']);assert.ok(!comment.text.includes('scriptOnly'));assert.ok(!JSON.stringify(comment).includes('?token='));
  f.db.prepare('UPDATE production_local_comments SET body_html=?,body_json=NULL').run('x'.repeat(200001));
  const large=await readComments({request,env:f.env,params:{id:'card'}});const entry=(await large.json()).data[0];assert.ok(entry.warnings.includes('comment_content_truncated'));assert.ok(entry.warnings.includes('comment_text_truncated'));assert.equal(entry.text.length,50000);
});

const eventSecret='whsec_'+Buffer.alloc(32,7).toString('base64');
const subscriptionParams=(url='https://chatgpt.com/backend-api/mcp-events/test')=>({name:'mux.asset.ready',arguments:{},delivery:{mode:'webhook',url,secret:eventSecret}});
const readyEvent=(asset='newAsset')=>({id:crypto.randomUUID(),created_at:new Date().toISOString(),data:{id:asset}});
async function eventClient(f) {
  const token=await f.token();
  const rpc=async(method,params)=>{
    const r=await f.fetch('/mcp',{method:'POST',headers:{authorization:`Bearer ${token.access}`,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,...(params?{params}:{})})});
    return r.json();
  };
  return {rpc,token};
}
function receiver(t,handler=()=>new Response(null,{status:204})) {
  const previous=globalThis.fetch, calls=[];
  globalThis.fetch=async(url,init)=>{
    assert.equal(new URL(url).hostname,'chatgpt.com');assert.equal(init.redirect,'error');
    const body=JSON.parse(init.body);calls.push({url,init,body});
    if(body.type==='verification')return Response.json({challenge:body.challenge});
    return handler(url,init,body);
  };
  t.after(()=>{globalThis.fetch=previous;});return calls;
}
async function validEventSignature(call,secret=eventSecret) {
  const h=call.init.headers;
  const key=await crypto.subtle.importKey('raw',Buffer.from(secret.slice(6),'base64'),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const message=`${h['webhook-id']}.${h['webhook-timestamp']}.${call.init.body}`;
  for(const signed of h['webhook-signature'].split(' ')) if(await crypto.subtle.verify('HMAC',key,Buffer.from(signed.slice(3),'base64'),new TextEncoder().encode(message)))return true;
  return false;
}
test('MCP advertises an event and authenticates discovery, subscription and unsubscribe',async t=>{
  const f=fixture(t),{rpc}=await eventClient(f),calls=receiver(t);
  const init=await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'events-test',version:'1'}});
  assert.deepEqual(init.result.capabilities.events,{});
  const list=await rpc('events/list',{});assert.equal(list.result.events[0].name,'mux.asset.ready');assert.equal(list.result.events[0].inputSchema.additionalProperties,false);
  const anonymous=await f.fetch('/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:'events/list'})});assert.equal(anonymous.status,401);
  const first=await rpc('events/subscribe',subscriptionParams());assert.ok(first.result?.id,JSON.stringify(first));assert.equal(first.result.cursor,null);
  assert.equal(calls.length,1);assert.equal(calls[0].body.type,'verification');assert.ok(await validEventSignature(calls[0]));
  const repeated=await rpc('events/subscribe',subscriptionParams());assert.equal(repeated.result.id,first.result.id);assert.equal(calls.length,1,'Verified callbacks are briefly cached');
  assert.equal(f.auth.prepare('SELECT COUNT(*) n FROM mcp_event_subscriptions').get().n,1);
  const {secret,...delivery}=subscriptionParams().delivery;
  const stop={name:'mux.asset.ready',arguments:{},delivery};
  assert.deepEqual((await rpc('events/unsubscribe',stop)).result,{});assert.deepEqual((await rpc('events/unsubscribe',stop)).result,{});
  assert.equal(f.auth.prepare('SELECT COUNT(*) n FROM mcp_event_subscriptions').get().n,0);
});
test('event callbacks reject SSRF targets, invalid keys, filters and failed challenge responses',async t=>{
  const f=fixture(t),{rpc}=await eventClient(f),calls=receiver(t);
  for(const url of ['http://chatgpt.com/callback','https://127.0.0.1/callback','https://chatgpt.com.evil.test/callback','https://chatgpt.com@localhost/callback','https://chatgpt.com:8443/callback','https://chatgpt.com/callback#fragment'])assert.equal((await rpc('events/subscribe',subscriptionParams(url))).error.code,-32602);
  assert.equal((await rpc('events/subscribe',{...subscriptionParams(),arguments:{client:'BMW'}})).error.code,-32602);
  assert.equal((await rpc('events/subscribe',{...subscriptionParams(),cursor:'old-event'})).error.code,-32602);
  for(const secret of ['weak','whsec_YQ==','whsec_'+'a'.repeat(99)])assert.equal((await rpc('events/subscribe',{...subscriptionParams(),delivery:{...subscriptionParams().delivery,secret}})).error.code,-32602);
  assert.equal(calls.length,0);
  for(const response of [()=>Response.json({challenge:'wrong'}),()=>new Response(null,{status:302,headers:{location:'https://127.0.0.1'}}),()=>new Response('x'.repeat(5000))]) {
    globalThis.fetch=async()=>response();assert.equal((await rpc('events/subscribe',subscriptionParams())).error.code,-32015);
  }
  assert.equal(f.auth.prepare('SELECT COUNT(*) n FROM mcp_event_subscriptions').get().n,0);
  assert.ok(!JSON.stringify(f.db.prepare('SELECT * FROM integration_events').all()).includes(eventSecret));
});
test('ready-event fan-out is atomic, deduplicated per asset, future-only and immediately due',async t=>{
  const f=fixture(t),{rpc}=await eventClient(f),calls=receiver(t);
  await enqueueMuxReady(f.env,readyEvent('beforeSubscription'));
  await rpc('events/subscribe',subscriptionParams());
  const event=readyEvent();await enqueueMuxReady(f.env,event);await enqueueMuxReady(f.env,event);await enqueueMuxReady(f.env,readyEvent());
  assert.equal(f.auth.prepare('SELECT COUNT(*) n FROM mcp_event_deliveries').get().n,1);
  assert.ok(f.auth.prepare('SELECT next_attempt FROM mcp_event_deliveries').get().next_attempt<=Date.now()/1000);
  await Promise.all([deliverEvents(f.env),deliverEvents(f.env)]);
  const received=calls.filter(c=>!c.body.type);assert.equal(received.length,1);assert.ok(await validEventSignature(received[0]));
  assert.deepEqual(received[0].body.data,{assetId:'newAsset'});assert.equal(received[0].body.cursor,null);assert.equal(received[0].init.headers['webhook-id'],received[0].body.eventId);
  await enqueueMuxReady(f.env,event);await deliverEvents(f.env);assert.equal(calls.filter(c=>!c.body.type).length,1);
  f.auth.exec("CREATE TRIGGER fail_fanout BEFORE INSERT ON mcp_event_deliveries BEGIN SELECT RAISE(ABORT,'private-db-message'); END;");
  await assert.rejects(enqueueMuxReady(f.env,readyEvent('rollback')));assert.equal(f.auth.prepare("SELECT COUNT(*) n FROM mcp_mux_events WHERE asset_id='rollback'").get().n,0);
});
test('event retries preserve identity, recover leases and stop at bounded attempts or permanent rejection',async t=>{
  const f=fixture(t),{rpc}=await eventClient(f);let status=503;const calls=receiver(t,()=>new Response(null,{status}));
  await rpc('events/subscribe',subscriptionParams());await enqueueMuxReady(f.env,readyEvent());await deliverEvents(f.env);
  let row=f.auth.prepare('SELECT * FROM mcp_event_deliveries').get();assert.equal(row.state,'pending');assert.equal(row.attempts,1);assert.ok(row.next_attempt>Date.now()/1000);
  await deliverEvents(f.env);assert.equal(calls.filter(c=>!c.body.type).length,1);
  f.auth.exec('UPDATE mcp_event_deliveries SET next_attempt=0,lease_until=0');status=204;await deliverEvents(f.env);
  const delivered=calls.filter(c=>!c.body.type);assert.equal(delivered.length,2);assert.equal(delivered[0].body.eventId,delivered[1].body.eventId);assert.ok(await validEventSignature(delivered[1]));
  await enqueueMuxReady(f.env,readyEvent('exhaust'));f.auth.exec("UPDATE mcp_event_deliveries SET attempts=9,lease_until=1 WHERE state='pending'");status=503;await deliverEvents(f.env);
  assert.equal(f.auth.prepare("SELECT state FROM mcp_event_deliveries WHERE attempts=10").get().state,'failed');
  await enqueueMuxReady(f.env,readyEvent('oversized'));status=413;await deliverEvents(f.env);assert.equal(f.auth.prepare("SELECT COUNT(*) n FROM mcp_event_deliveries WHERE state='failed'").get().n,2);
  await enqueueMuxReady(f.env,readyEvent('gone'));status=410;await deliverEvents(f.env);assert.equal(f.auth.prepare('SELECT COUNT(*) n FROM mcp_event_subscriptions').get().n,0);assert.equal(f.auth.prepare('SELECT COUNT(*) n FROM mcp_event_deliveries').get().n,0);
});
test('subscription expiry, rotation and isolation survive new requests and connection revocation',async t=>{
  const f=fixture(t),a=await eventClient(f),b=await eventClient(f),calls=receiver(t);
  const sub=await a.rpc('events/subscribe',{...subscriptionParams(),ttlMs:120000});assert.ok(Date.parse(sub.result.refreshBefore)<=Date.now()+120000);
  await b.rpc('events/unsubscribe',subscriptionParams());assert.equal(f.auth.prepare('SELECT COUNT(*) n FROM mcp_event_subscriptions').get().n,1,'Other OAuth families cannot unsubscribe');
  const rotated='whsec_'+Buffer.alloc(32,9).toString('base64');
  const refresh=await a.rpc('events/subscribe',{...subscriptionParams(),ttlMs:null,delivery:{...subscriptionParams().delivery,secret:rotated}});assert.equal(refresh.result.id,sub.result.id);assert.ok(refresh.result.refreshBefore);
  await enqueueMuxReady(f.env,readyEvent());await deliverEvents(f.env);const event=calls.find(c=>!c.body.type);assert.ok(await validEventSignature(event));assert.ok(await validEventSignature(event,rotated));
  await enqueueMuxReady(f.env,readyEvent('pending'));await f.form('/revoke',{token:a.token.refresh,client_id:a.token.grant.client_id});await deliverEvents(f.env);assert.equal(calls.filter(c=>!c.body.type).length,1);
  await b.rpc('events/subscribe',subscriptionParams());await enqueueMuxReady(f.env,readyEvent('expires'));f.auth.exec('UPDATE mcp_event_subscriptions SET expires_at=0');await deliverEvents(f.env);assert.equal(calls.filter(c=>!c.body.type).length,1);
});
test('event errors are redacted and subscription quotas are enforced',async t=>{
  const f=fixture(t),{rpc}=await eventClient(f);receiver(t);
  for(let i=0;i<10;i++)assert.ok((await rpc('events/subscribe',subscriptionParams('https://chatgpt.com/callback/'+i))).result);
  assert.ok((await rpc('events/subscribe',subscriptionParams('https://chatgpt.com/callback/extra'))).error);
  f.auth.exec("CREATE TRIGGER fail_subscription BEFORE INSERT ON mcp_event_subscriptions BEGIN SELECT RAISE(ABORT,'PRIVATE DATABASE TOKEN'); END;");
  const error=await rpc('events/subscribe',subscriptionParams('https://chatgpt.com/callback/0'));assert.equal(error.error.code,-32603);assert.ok(!JSON.stringify(error).includes('PRIVATE'));
});

test('Mux webhook verifies bounded signed input and persists only ready events before acknowledgment',async t=>{
  const f=fixture(t);f.env.MUX_WEBHOOK_SIGNING_SECRET='fixture-mux-secret';
  f.db.exec('CREATE TABLE mux_library_browse_state(id TEXT,refreshed_at TEXT)');
  const tasks=[];const call=async(body,options={})=>{
    const timestamp=options.timestamp??Math.floor(Date.now()/1000);
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(f.env.MUX_WEBHOOK_SIGNING_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const sig=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${body}`))).toString('hex');
    const result=await muxWebhook({request:new Request('https://deck.test/api/webhooks/mux',{method:'POST',headers:{'mux-signature':`t=${timestamp},v1=${options.bad?'bad':sig}`},body}),env:f.env,waitUntil:p=>tasks.push(p)});
    await Promise.all(tasks.splice(0));return result;
  };
  const event={type:'video.asset.ready',...readyEvent()};
  assert.equal((await call(JSON.stringify(event),{bad:true})).status,401);
  assert.equal((await call(JSON.stringify(event),{timestamp:1})).status,401);
  assert.equal((await call('bad-json')).status,400);
  assert.equal((await call('x'.repeat(1048577))).status,413);
  assert.equal((await call(JSON.stringify({type:'video.asset.ready',data:{id:'bad id'}}))).status,400);
  assert.equal((await call(JSON.stringify({type:'video.upload.created'}))).status,200);
  assert.equal(f.auth.prepare('SELECT COUNT(*) n FROM mcp_mux_events').get().n,0);
  assert.equal((await call(JSON.stringify(event))).status,200);assert.equal((await call(JSON.stringify(event))).status,200);
  assert.equal(f.auth.prepare('SELECT COUNT(*) n FROM mcp_mux_events').get().n,1);
  f.auth.exec("CREATE TRIGGER webhook_storage_failure BEFORE INSERT ON mcp_mux_events BEGIN SELECT RAISE(ABORT,'PRIVATE'); END;");
  const failure=await call(JSON.stringify({type:'video.asset.ready',...readyEvent('storageFailure')}));assert.equal(failure.status,503);assert.ok(!(await failure.text()).includes('PRIVATE'));
});
test('invitation revocation stops event delivery even while its OAuth session exists',async t=>{
  const f=fixture(t);const{rpc,token}=await eventClient(f),calls=receiver(t);
  await rpc('events/subscribe',subscriptionParams());
  const invitation='fixture-invitation';f.auth.prepare('INSERT INTO mcp_invitations(id,email,nickname,code_hash,created_at,expires_at,redeemed_at) VALUES(?,?,?,?,?,?,?)').run(invitation,'fixture@example.test','Fixture','unused','now',253402300799,'now');
  f.auth.prepare("UPDATE oauth_records SET data=json_set(data,'$.invitationId',?) WHERE kind='session'").run(invitation);
  await enqueueMuxReady(f.env,readyEvent());f.auth.prepare('UPDATE mcp_invitations SET revoked_at=? WHERE id=?').run('now',invitation);
  await deliverEvents(f.env);assert.equal(calls.filter(c=>!c.body.type).length,0);assert.equal(f.auth.prepare('SELECT COUNT(*) n FROM mcp_event_subscriptions').get().n,0);
});

const notifications=await import(pathToFileURL(join(temp,'functions/_lib/notifications.mjs')));
const {onRequest:inboxApi}=await import(pathToFileURL(join(temp,'functions/api/admin/inbox.mjs')));
const {onRequest:notificationsApi}=await import(pathToFileURL(join(temp,'functions/api/internal/v1/notifications.mjs')));
const sender={type:'integration',id:'sender',name:'Sender',email:null,scopes:new Set(['notifications:send'])};
const notificationInput=()=>({requestId:crypto.randomUUID(),recipients:['taylor@trantergrey.com'],title:'Check video',body:'Please review this match.',href:'/app/deck?card=one'});
function inboxSession(f,email='taylor@trantergrey.com') {
 const id=crypto.randomUUID();f.db.prepare('INSERT INTO admin_sessions VALUES(?,?,?,?)').run(id,'Taylor',email,new Date(Date.now()+86400000).toISOString());
 return {id,call:(body,query='',origin='https://deck.test')=>inboxApi({env:f.env,request:new Request('https://deck.test/api/admin/inbox'+query,{headers:{cookie:`tg_admin=${id}`,origin,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})})})};
}
async function pushKeys(f){const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const jwk=await crypto.subtle.exportKey('jwk',pair.privateKey);f.env.PUSH_VAPID_PUBLIC_KEY=Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('base64url');f.env.PUSH_VAPID_PRIVATE_KEY=jwk.d;
 const device=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);return {endpoint:'https://web.push.apple.com/test-'+crypto.randomUUID(),keys:{p256dh:Buffer.from(await crypto.subtle.exportKey('raw',device.publicKey)).toString('base64url'),auth:Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url')}};
}
test('notifications are atomic, deduplicated concurrently, reject changed retries and validate recipients/links',async t=>{
 const f=fixture(t),input=notificationInput();
 await Promise.all([notifications.sendNotification(f.env,sender,input),notifications.sendNotification(f.env,sender,input)]);
 assert.equal(f.db.prepare('SELECT count(*) n FROM team_notifications').get().n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM notification_requests').get().n,1);
 await assert.rejects(()=>notifications.sendNotification(f.env,sender,{...input,title:'changed'}),e=>e.status===409);
 for(const href of ['https://evil.test','//evil.test','/app/../admin','/app/\\evil.test','javascript:alert(1)'])await assert.rejects(()=>notifications.sendNotification(f.env,sender,{...notificationInput(),href}));
 await assert.rejects(()=>notifications.sendNotification(f.env,sender,{...notificationInput(),recipients:['unknown@trantergrey.com']}));
 assert.equal(f.db.prepare('SELECT count(*) n FROM team_notifications').get().n,1);
 f.db.exec(`CREATE TRIGGER fail_notification BEFORE INSERT ON team_notifications BEGIN SELECT RAISE(ABORT,'fixture failure'); END;`);
 await assert.rejects(()=>notifications.sendNotification(f.env,sender,notificationInput()));assert.equal(f.db.prepare('SELECT count(*) n FROM notification_requests').get().n,1);
});
test('inbox isolates users, protects writes, paginates and preserves read status on retry',async t=>{
 const f=fixture(t),a=inboxSession(f),b=inboxSession(f,'other@trantergrey.com');f.db.prepare('INSERT INTO admin_team_directory VALUES(?,?)').run('Other','other@trantergrey.com');
 const input=notificationInput();const saved=await notifications.sendNotification(f.env,sender,input);await notifications.sendNotification(f.env,sender,notificationInput());const id=saved.notifications[0].id;
 assert.equal((await a.call({action:'read',id},'','https://evil.test')).status,403);
 await b.call({action:'read',id});assert.equal(f.db.prepare('SELECT read_at FROM team_notifications WHERE id=?').get(id).read_at,null);
 assert.equal((await (await b.call()).json()).data.items.length,0);
 const first=(await (await a.call(undefined,'?limit=1')).json()).data;assert.ok(first.nextCursor);const second=(await (await a.call(undefined,'?limit=1&cursor='+encodeURIComponent(first.nextCursor))).json()).data;assert.notEqual(first.items[0].id,second.items[0].id);
 await a.call({action:'read',id});await notifications.sendNotification(f.env,sender,input);assert.ok(f.db.prepare('SELECT read_at FROM team_notifications WHERE id=?').get(id).read_at);
 assert.equal((await (await a.call()).json()).data.unread,1);
 const unauth=await inboxApi({env:f.env,request:new Request('https://deck.test/api/admin/inbox')});assert.equal(unauth.status,401);
});
test('push subscriptions validate targets and keys, and device opt-out removes queued jobs',async t=>{
 const f=fixture(t),session=inboxSession(f),sub=await pushKeys(f);
 for(const endpoint of ['https://127.0.0.1/test','http://web.push.apple.com/test','https://web.push.apple.com.evil.test/test','https://web.push.apple.com:999/test'])assert.equal((await session.call({action:'subscribe',subscription:{...sub,endpoint}})).status,400);
 assert.equal((await session.call({action:'subscribe',subscription:{...sub,keys:{...sub.keys,p256dh:'A'.repeat(87)}}})).status,400);
 assert.equal((await session.call({action:'subscribe',subscription:sub})).status,200);
 await notifications.sendNotification(f.env,sender,notificationInput());assert.equal(f.db.prepare('SELECT count(*) n FROM notification_push_jobs').get().n,1);
 assert.equal((await session.call({action:'unsubscribe',endpoint:sub.endpoint})).status,200);assert.equal(f.db.prepare('SELECT count(*) n FROM notification_push_jobs').get().n,0);
 assert.equal(f.db.prepare('SELECT count(*) n FROM team_notifications').get().n,1);
});
test('push uses encrypted payloads, retries transient failures, removes expired subscriptions and skips logged-out devices',async t=>{
 const f=fixture(t),session=inboxSession(f),sub=await pushKeys(f);await session.call({action:'subscribe',subscription:sub});
 await notifications.sendNotification(f.env,sender,notificationInput());let calls=0;const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,sub.endpoint);assert.equal(options.redirect,'manual');assert.ok(options.headers);const headers=new Headers(options.headers);assert.equal(headers.get('content-encoding'),'aes128gcm');assert.match(headers.get('authorization'),/^vapid /);assert.ok(!Buffer.from(options.body).includes(Buffer.from('Check video')));return new Response(null,{status:calls===1?503:201});};
 await notifications.deliverNotificationPush(f.env);assert.equal(f.db.prepare('SELECT status FROM notification_push_jobs').get().status,'pending');
 f.db.exec('UPDATE notification_push_jobs SET next_attempt=0');await Promise.all([notifications.deliverNotificationPush(f.env),notifications.deliverNotificationPush(f.env)]);assert.equal(calls,2);assert.equal(f.db.prepare('SELECT status FROM notification_push_jobs').get().status,'accepted');
 await notifications.sendNotification(f.env,sender,notificationInput());globalThis.fetch=async()=>new Response(null,{status:410});await notifications.deliverNotificationPush(f.env);assert.equal(f.db.prepare('SELECT count(*) n FROM push_subscriptions').get().n,0);
 await session.call({action:'subscribe',subscription:sub});await notifications.sendNotification(f.env,sender,notificationInput());f.db.prepare('DELETE FROM admin_sessions WHERE id=?').run(session.id);globalThis.fetch=async()=>{assert.fail('Revoked session must not receive push');};await notifications.deliverNotificationPush(f.env);assert.equal(f.db.prepare("SELECT count(*) n FROM notification_push_jobs WHERE status='skipped'").get().n,1);
});
test('notification tools require explicit consent and refresh retains the original scope',async t=>{
 const f=fixture(t);
 async function connect(token){const c=new Client({name:'notification-test',version:'1'});await c.connect(new StreamableHTTPClientTransport(new URL(f.env.MCP_ORIGIN+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token.access}`}},fetch:(url,options)=>f.fetch(url,options)}));t.after(()=>c.close());return c;}
 const old=await f.token();const oldClient=await connect(old);assert.equal((await oldClient.callTool({name:'list_notification_recipients',arguments:{}})).isError,true);
 const newToken=await f.token(undefined,'tg:personal notifications:send');const c=await connect(newToken);assert.equal((await c.callTool({name:'list_notification_recipients',arguments:{}})).structuredContent.recipients.length,1);
 const input=notificationInput();assert.equal((await c.callTool({name:'send_team_notification',arguments:input})).structuredContent.saved,true);
 assert.equal((await c.callTool({name:'send_team_notification',arguments:input})).structuredContent.saved,true);
 const renewed=await f.form('/token',{grant_type:'refresh_token',refresh_token:newToken.refresh,client_id:newToken.grant.client_id,resource:f.env.MCP_ORIGIN+'/mcp'});assert.equal((await renewed.json()).scope,'tg:personal notifications:send');
 const oldRenew=await f.form('/token',{grant_type:'refresh_token',refresh_token:old.refresh,client_id:old.grant.client_id,resource:f.env.MCP_ORIGIN+'/mcp'});assert.equal((await oldRenew.json()).scope,'tg:personal');
 assert.equal(f.db.prepare('SELECT count(*) n FROM team_notifications').get().n,1);
});
test('notification REST endpoint rejects anonymous and legacy broad-token callers',async t=>{
 const f=fixture(t);f.env.PRODUCTION_API_TOKEN='legacy-token';
 const call=headers=>notificationsApi({env:f.env,request:new Request('https://deck.test/api/internal/v1/notifications',{headers})});
 assert.equal((await call({})).status,401);assert.equal((await call({authorization:'Bearer legacy-token'})).status,403);
});

test('notification REST credential scopes, payload bounds, send limits and retry exceptions',async t=>{
 const f=fixture(t),id=crypto.randomUUID(),token=`tg_${id}_${'x'.repeat(32)}`;
 const secret=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
 f.db.prepare('INSERT INTO api_integration_credentials(id,name,secret_hash,scopes_json,created_at) VALUES(?,?,?,?,?)').run(id,'Test notifier',secret,'["notifications:send"]','now');
 const call=body=>notificationsApi({env:f.env,request:new Request('https://deck.test/api/internal/v1/notifications',{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})});
 assert.equal((await call()).status,200);const input=notificationInput();assert.equal((await call(input)).status,200);
 assert.equal((await call({...notificationInput(),body:'x'.repeat(20000)})).status,413);
 for(let i=1;i<10;i++)assert.equal((await call(notificationInput())).status,200);
 assert.equal((await call(notificationInput())).status,429);assert.equal((await call(input)).status,200);
 assert.equal((await call({...input,title:'changed'})).status,409);
});

test('service worker keeps private content out of push display and opens the inbox',async()=>{
 const {runInNewContext}=await import('node:vm');const listeners={};let shown,opened,notified=0,pending;
 runInNewContext(await readFile('public/sw.js','utf8'),{self:{addEventListener:(name,fn)=>listeners[name]=fn,registration:{showNotification:async(title,options)=>{shown={title,options};}},clients:{matchAll:async()=>[{postMessage:()=>notified++}],openWindow:async path=>{opened=path;}}},URL});
 listeners.push({data:{json:()=>({id:'11111111-1111-4111-8111-111111111111',title:'Private title',url:'https://evil.test'})},waitUntil:p=>{pending=p;}});await pending;
 assert.equal(shown.title,'TG Team');assert.ok(!JSON.stringify(shown).includes('Private title'));assert.equal(notified,1);
 listeners.notificationclick({notification:{close(){}},waitUntil:p=>{pending=p;}});await pending;assert.equal(opened,'/app/inbox');
});


test('push stops after a crashed final attempt and keeps the inbox',async t=>{
 const f=fixture(t),session=inboxSession(f),sub=await pushKeys(f);await session.call({action:'subscribe',subscription:sub});await notifications.sendNotification(f.env,sender,notificationInput());
 f.db.exec("UPDATE notification_push_jobs SET attempts=8,next_attempt=0,lease='crashed'");const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);globalThis.fetch=async()=>assert.fail('Exhausted jobs must not send again');
 await notifications.deliverNotificationPush(f.env);assert.equal(f.db.prepare('SELECT status FROM notification_push_jobs').get().status,'failed');assert.equal(f.db.prepare('SELECT count(*) n FROM team_notifications').get().n,1);
});
