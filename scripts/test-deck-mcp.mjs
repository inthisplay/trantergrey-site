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
await build({ entryPoints: ['workers/deck-mcp/index.ts', 'functions/api/internal/v1/cards.ts', 'functions/api/admin/mcp-connections.ts', 'functions/api/internal/v1/client-hq.ts', 'functions/api/admin/client-hq.ts', 'functions/_lib/integration-request.ts', 'functions/_lib/integration-health.ts', 'functions/api/admin/integration-health.ts'], bundle: true, platform: 'node', format: 'esm', outbase: '.', outdir: temp, outExtension: { '.js': '.mjs' } });
const worker = (await import(pathToFileURL(join(temp, 'workers/deck-mcp/index.mjs')))).default;
const { onRequestPost } = await import(pathToFileURL(join(temp, 'functions/api/internal/v1/cards.mjs')));
const { onRequest: manageConnections } = await import(pathToFileURL(join(temp, 'functions/api/admin/mcp-connections.mjs')));
const { onRequest: clientHQApi } = await import(pathToFileURL(join(temp, 'functions/api/internal/v1/client-hq.mjs')));
const { onRequest: clientHQAdmin } = await import(pathToFileURL(join(temp, 'functions/api/admin/client-hq.mjs')));
const { integrationRequest } = await import(pathToFileURL(join(temp, 'functions/_lib/integration-request.mjs')));
const { enforceRateLimit, cleanupIntegrationHealth } = await import(pathToFileURL(join(temp, 'functions/_lib/integration-health.mjs')));
const { onRequest: healthApi } = await import(pathToFileURL(join(temp, 'functions/api/admin/integration-health.mjs')));
after(() => rm(temp, { recursive: true, force: true }));
const schemas = await Promise.all(['0008_production_board', '0009_production_card_overrides', '0010_production_card_work_fields', '0011_production_card_sort_order', '0012_production_column_controls', '0013_production_comment_blocks', '0015_production_comment_authors', '0051_comment_questions', '0017_internal_api_foundation', '0025_production_card_deletions', '0052_card_creation_requests', '0053_mcp_item_requests','0054_integration_health'].map(name => readFile(`migrations/${name}.sql`, 'utf8')));
const authSchema = await readFile('workers/deck-mcp/auth-schema.sql', 'utf8');
const hash = async value => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('base64url');

function binding(db) {
  return { prepare(sql) {
    let values = [];
    const s = { bind(...v) { values = v; return s; }, async first() { return db.prepare(sql).get(...values) ?? null; }, async all() { return { results: db.prepare(sql).all(...values) }; }, async run() { return db.prepare(sql).run(...values); } };
    return s;
  }, async batch(statements) {
    db.exec('BEGIN');
    try { const result = []; for (const s of statements) result.push(await s.run()); db.exec('COMMIT'); return result; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
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
  async function grant(accessCode = env.TEST_ACCESS_CODE) {
    const registration = await fetch('/register', { method: 'POST', body: JSON.stringify({ redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'], token_endpoint_auth_method: 'none' }) });
    assert.equal(registration.status, 201);
    const { client_id } = await registration.json();
    const verifier = 'x'.repeat(64);
    const parameters = { client_id, redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect', response_type: 'code', code_challenge_method: 'S256', code_challenge: await hash(verifier), resource: env.MCP_ORIGIN + '/mcp', scope: 'tg:personal', state: 'return-state' };
    const page = await fetch('/authorize?' + new URLSearchParams(parameters)); assert.equal(page.status, 200);
    assert.equal(page.headers.get('referrer-policy'), 'same-origin', 'Consent form must preserve browser Origin on same-site POST');
    assert.equal(page.headers.get('content-security-policy'), `default-src 'none'; form-action 'self' ${parameters.redirect_uri}; frame-ancestors 'none'; base-uri 'none'`);
    const cookie = page.headers.get('set-cookie').split(';')[0];
    const transaction = (await page.text()).match(/name="transaction" value="([^"]+)"/)[1];
    const approve = () => form('/authorize', { transaction, access_code: accessCode }, { origin: env.MCP_ORIGIN, cookie });
    return { parameters, client_id, verifier, approve, cookie, transaction };
  }
  async function token(accessCode = env.TEST_ACCESS_CODE) {
    const g = await grant(accessCode); const response = await g.approve(); assert.equal(response.status, 303);
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

test('real MCP client discovers 23 tools and creates one audited card across retries', async t => {
  const f = fixture(t); const { access } = await f.token();
  const client = new Client({ name: 'deck-test', version: '1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(f.env.MCP_ORIGIN + '/mcp'), { requestInit: { headers: { Authorization: `Bearer ${access}` } }, fetch: (url, options) => f.fetch(url, options) });
  await client.connect(transport);
  try {
    const tools = await client.listTools(); assert.equal(tools.tools.length, 23); assert.equal(new Set(tools.tools.map(x => x.name)).size, 23); assert.ok(tools.tools.some(x => x.name === 'report_deck_moves')); for (const tool of tools.tools) assert.equal(typeof tool.annotations.readOnlyHint, 'boolean');
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
    CREATE TABLE mux_library_snapshot_state(id TEXT,refresh_id TEXT,refreshed_at TEXT);
    CREATE TABLE mux_library_assets(asset_id TEXT,refresh_id TEXT,value TEXT);
    CREATE TABLE archive_imports(asset_id TEXT,vimeo_id TEXT,upload_id TEXT);
    CREATE TABLE archive_videos(vimeo_id TEXT,title TEXT,created_at TEXT,client TEXT,folder TEXT);
    INSERT INTO mux_asset_metadata VALUES('newvideo','VGA','VGA fall','[]','published',NULL,1),('oldvideo','VGA','VGA spring','[]','published',NULL,1);`);
  f.db.prepare('INSERT INTO mux_library_snapshot_state VALUES(?,?,?)').run('library','fixture',new Date().toISOString());
  for(const [id,date] of [['oldvideo','2026-04-01'],['newvideo','2026-11-01']]) f.db.prepare('INSERT INTO mux_library_assets VALUES(?,?,?)').run(id,'fixture',JSON.stringify({id,title:id,createdAt:date,duration:30,playbackId:'play'+id,playbackPolicy:'public',thumbnailUrl:null}));
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
  assert.equal(responses.filter(Boolean).length,4);assert.equal(responses[3].status,429);assert.equal(responses[3].headers.get('retry-after'),'60');
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
