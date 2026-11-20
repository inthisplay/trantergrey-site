import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const dir = await mkdtemp(join(tmpdir(), 'tg-history-'));
const entries = { history: 'functions/api/admin/production-board/history.ts', columns: 'functions/api/admin/production-board/columns/[id].ts', comments: 'functions/api/admin/production-board/[id]/comments.ts', commands: 'functions/_lib/production-commands.ts', card: 'functions/api/admin/production-board/[id].ts', cards: 'functions/api/admin/production-board/cards.ts', media: 'functions/_lib/deck-history.ts' };
const handlers = {};
for (const [name, path] of Object.entries(entries)) {
  await build({ entryPoints: [path], bundle: true, platform: 'browser', format: 'esm', outfile: join(dir, name + '.mjs') });
  handlers[name] = await import(pathToFileURL(join(dir, name + '.mjs')));
}
after(() => rm(dir, { recursive: true, force: true }));
const migrations = await Promise.all(['0008_production_board','0009_production_card_overrides','0010_production_card_work_fields','0011_production_card_sort_order','0012_production_column_controls','0013_production_comment_blocks','0015_production_comment_authors','0017_internal_api_foundation','0023_production_column_colors','0025_production_card_deletions','0050_production_card_signals','0051_comment_questions'].map(name => readFile('migrations/' + name + '.sql', 'utf8')));
const migration = await readFile('migrations/0024_deck_history.sql', 'utf8');
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  migrations.forEach(sql => db.exec(sql));
  db.exec(`CREATE TABLE admin_sessions(id TEXT,user_name TEXT,user_email TEXT,expires_at TEXT);
    CREATE TABLE client_directory(name TEXT PRIMARY KEY, created_at TEXT);
    CREATE TABLE admin_team_directory(nickname TEXT);
    INSERT INTO admin_sessions VALUES ('test','Test Author','test@example.com','9999-01-01');
    INSERT INTO production_columns(source_id,name,imported_at) VALUES ('edit','Edit','2026-11-17'),('done','Done','2026-11-17');
    INSERT INTO production_cards(id,source_id,column_source_id,title,created_at,source_json,imported_at) VALUES ('card','source','edit','Test card','2026-11-01T09:00:00Z','{}','2026-11-17');
    INSERT INTO production_events(source_id,card_source_id,summary,source_json,imported_at) VALUES ('undated','source','Warren moved this card to Edit.','{}','2026-11-17');
    INSERT INTO production_comments(source_id,card_source_id,body_html,author_json,created_at,source_json,imported_at) VALUES ('old-comment','source','<p>Original comment</p>','{"name":"Original Author"}','2026-11-02T09:00:00Z','{}','2026-11-17');`);
  db.exec(migration);
  const env = { GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture', TG_DATA: { prepare(sql) {
    let values = [];
    const statement = { bind(...args) { values = args; return statement; }, async first() { return db.prepare(sql).get(...values) ?? null; }, async all() { return { results: db.prepare(sql).all(...values) }; }, async run() { return db.prepare(sql).run(...values); } };
    return statement;
  }, async batch(statements) { db.exec('BEGIN'); try { const result = []; for (const statement of statements) result.push(await statement.run()); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; } } } };
  const request = (query = '', authenticated = true) => new Request('https://local.test/api/admin/production-board/history' + query, { headers: authenticated ? {cookie:'tg_admin=test'} : {} });
  const history = async (query = '') => { const response = await handlers.history.onRequestGet({request:request(query),env}); return {status:response.status,...await response.json()}; };
  return { db, env, request, history };
}
function comment(db, id = 'comment-12345678901234567890') { db.prepare('INSERT INTO production_local_comments(id,card_source_id,body_html,author_name,author_email,created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id,'source','<p>Private note</p>','Test Author','test@example.com','2026-11-17T15:00:00.000Z'); return id; }

test('backfill preserves the source, normalizes dates, and keeps unknown dates unknown', async () => {
  const {db,history}=fixture();try {
    const {events}=await history();assert.equal(events.length,3);
    assert.equal(events[0].occurredAt,'2026-11-02T09:00:00.000Z');assert.equal(events.at(-1).occurredAt,null);
    assert.equal(events.at(-1).actor,'Warren');assert.equal(events[0].actor,'Original Author');
    assert.equal(db.prepare('SELECT body_html FROM production_comments').get().body_html,'<p>Original comment</p>');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM production_cards').get().n,1);
  } finally {db.close();}
});
test('keyset pages are bounded, stable for timestamp ties, and use the index', async () => {
  const {db,history,env,request}=fixture();try {
    for(let i=0;i<60;i++) comment(db,'comment-'+i);
    let cursor=null, ids=[];
    do {const result=await history('?limit=7'+(cursor?'&cursor='+cursor:''));assert(result.events.length<=7);ids.push(...result.events.map(e=>e.id));cursor=result.nextCursor;}while(cursor);
    assert.equal(ids.length,63);assert.equal(new Set(ids).size,63);
    assert.equal((await history('?filter=moves')).events.length,0);
    assert.equal((await history('?limit=999')).status,400);assert.equal((await history('?cursor=garbage')).status,400);
    assert.equal((await handlers.history.onRequestGet({env,request:request('',false)})).status,401);
    const plan=db.prepare('EXPLAIN QUERY PLAN SELECT id FROM production_deck_history WHERE (occurred_at,id)<(?,?) ORDER BY occurred_at DESC,id DESC LIMIT 26').all('2026','x');
    assert(plan.some(p=>p.detail.includes('production_deck_history_time')));
  } finally {db.close();}
});
test('comment edits are append-only and deletion redacts every earlier body', async () => {
  const {db,env,history}=fixture();try {
    const id=comment(db);
    const call=async(method,body)=>handlers.comments[method]({env,params:{id:'card'},request:new Request('https://local.test/comments',{method:'POST',headers:{cookie:'tg_admin=test'},body:JSON.stringify(body)})});
    assert.equal((await call('onRequestPatch',{commentId:id,body:[{type:'paragraph',children:[{text:'Revised private note'}]}]})).status,200);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM production_deck_history WHERE source_kind='local-comment'").get().n,2);
    assert.equal((await call('onRequestDelete',{commentId:id})).status,200);
    const events=(await history()).events.filter(e=>e.id.startsWith('local-comment')||e.id.startsWith('comment-'));
    assert.equal(events.length,3);assert(events.every(e=>!e.text&&!e.media.length));assert(events.some(e=>e.action==='comment_deleted'));
  } finally {db.close();}
});
test('desktop and shared move commands record actors and column actions', async () => {
  const {db,env,history}=fixture();try {
    const patch=body=>handlers.columns.onRequestPatch({env,params:{id:'edit'},request:new Request('https://local.test/columns/edit',{method:'PATCH',headers:{cookie:'tg_admin=test'},body:JSON.stringify(body)})});
    await patch({action:'color',color:'#edd9db'});await patch({action:'rename',name:'Editing'});await patch({action:'sort',direction:'newest'});
    await handlers.commands.moveProductionCard(env,'card',{columnSourceId:'done'},'Mobile user');
    const all=(await history()).events;
    assert(all.some(e=>e.action==='column_color_changed'&&e.actor==='Test Author'));
    assert(all.some(e=>e.action==='column_sorted'));assert(all.some(e=>e.action==='column_renamed'));
    const moves=(await history('?filter=moves')).events;assert.equal(moves.length,1);assert.equal(moves[0].actor,'Mobile user');assert.deepEqual(moves[0].changes[0],{label:'Status',before:'Editing',after:'Done'});
    await patch({action:'color',color:'#edd9db'});assert.equal((await history('?filter=management')).events.length,3);
  } finally {db.close();}
});
test('media extraction blocks unsafe URLs and retains authorized media as structured data', () => {
  const {historyMedia,historyText}=handlers.media;
  const media=historyMedia('<script>bad()</script><img src="javascript:alert(1)"><iframe src="https://evil.test/embed"></iframe><img src="/api/admin/production-board/attachments/bc-123" alt="Frame"><iframe src="https://player.mux.com/abc123"></iframe><a href="/watch/AbCd">Public link</a>');
  assert.equal(media.length,3);assert.equal(media[0].kind,'image');assert.equal(media[1].kind,'embed');assert.equal(media[2].kind,'file');
  assert.equal(historyText('<script>bad()</script><p>A &amp; B</p>'),'A & B');
});

test('card creation, rich notes, and archive changes use the signed-in actor without no-op entries', async () => {
  const {db,env,history}=fixture();try {
    const body={title:'Test card',notes:'Review this frame.',notesHtml:'<p>Review this frame.</p><img src="/api/admin/production-board/attachments/local-attachment-test">',client:'',assignedTo:'',dueOn:'',columnSourceId:'edit',archived:false};
    const patch=()=>handlers.card.onRequestPatch({env,params:{id:'card'},request:new Request('https://local.test/card',{method:'PATCH',headers:{cookie:'tg_admin=test'},body:JSON.stringify(body)})});
    assert.equal((await patch()).status,200);
    const note=(await history()).events.find(e=>e.action==='notes_updated');assert.equal(note.actor,'Test Author');assert.equal(note.media[0].kind,'image');
    const count=db.prepare('SELECT COUNT(*) n FROM production_deck_history').get().n;await patch();assert.equal(db.prepare('SELECT COUNT(*) n FROM production_deck_history').get().n,count);
    body.archived=true;await patch();assert((await history()).events.some(e=>e.action==='card_archived'));
    const created=await handlers.cards.onRequestPost({env,request:new Request('https://local.test/cards',{method:'POST',headers:{cookie:'tg_admin=test'},body:JSON.stringify({title:'New card',columnSourceId:'edit'})})});assert.equal(created.status,201);
    assert((await history()).events.some(e=>e.action==='card_created'&&e.actor==='Test Author'));
  } finally {db.close();}
});

test('video associations and local uploads enter history through their source writes', async () => {
  const {db,history}=fixture();try {
    db.exec(`INSERT INTO production_card_activity(id,card_id,event_type,occurred_at,actor_type,actor_id,details_json) VALUES ('api-test','card','video_linked','2026-11-17T18:00:00Z','user','Mobile user','{"playerUrl":"https://player.mux.com/abc123","title":"Client cut"}');
      INSERT INTO production_attachments(source_id,card_source_id,filename,content_type,status,source_json,imported_at) VALUES ('local-attachment-test','source','frame.jpg','image/jpeg','stored','{"uploadedBy":"Test Author","uploadedAt":"2026-11-17T18:01:00Z"}','2026-11-17');`);
    const events=(await history()).events;assert(events.some(e=>e.action==='video_linked'&&e.media[0].kind==='embed'));assert(events.some(e=>e.action==='attachment_added'&&e.actor==='Test Author'&&e.media[0].kind==='image'));
  } finally {db.close();}
});
