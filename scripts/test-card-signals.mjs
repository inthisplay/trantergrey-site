import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const dir = await mkdtemp(join(tmpdir(), 'tg-signals-'));
for (const [name, path] of [['api','functions/api/admin/production-board/[id]/signal.ts'], ['rules','lib/card-signal.ts'], ['dates','lib/comment-signal.ts'], ['commands','functions/_lib/production-commands.ts']]) {
 await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',outfile:join(dir, name+'.mjs')});
}
const { onRequestPatch } = await import(pathToFileURL(join(dir,'api.mjs')));
const { cardSignal } = await import(pathToFileURL(join(dir,'rules.mjs')));
after(()=>rm(dir,{recursive:true,force:true}));
const now = new Date('2026-11-20T17:00:00Z');
test('attention, imminent filming, dates, recent additions, dismissal and closed work',()=>{
 assert.equal(cardSignal({attention:'Casting options provided',filmingOn:'2026-11-25'},now).label,'Casting options provided');
 assert.equal(cardSignal({attention:'Casting options provided',filmingOn:'2026-11-21'},now).label,'Filming Nov 21');
 assert.equal(cardSignal({filmingOn:'2026-11-19'},now),null);
 assert.equal(cardSignal({filmingOn:'2026-12-15'},now),null);
 assert.equal(cardSignal({muxAddedAt:'2026-11-19T12:00:00Z',galleryAddedAt:'2026-11-20T12:00:00Z'},now).label,'Casting options added');
 assert.equal(cardSignal({muxAddedAt:'2026-11-19T12:00:00Z',dismissedAt:'2026-11-19T13:00:00Z'},now),null);
 assert.equal(cardSignal({muxAddedAt:'2026-11-01T12:00:00Z'},now),null);
 assert.equal(cardSignal({attention:'Review',archived:1},now),null);
 assert.equal(cardSignal({attention:'Review',completedAt:'2026-11-19'},now),null);
 assert.equal(cardSignal({filmingOn:'2027-01-02'},new Date('2026-12-31T17:00:00Z')).label,'Filming Jan 2, 2027');
 assert.equal(cardSignal({filmingOn:'2026-11-20'},new Date('2026-11-21T02:00:00Z')).label,'Filming Nov 20');
});
test('authenticated signal save validates inputs, isolates cards and preserves dismissal',async()=>{
 const db = new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE admin_sessions(id TEXT,user_name TEXT,user_email TEXT,expires_at TEXT);
 INSERT INTO admin_sessions VALUES('test','Team member','team@example.com','9999');
 CREATE TABLE production_cards(id TEXT,source_id TEXT UNIQUE); INSERT INTO production_cards VALUES('card','source'),('other','other-source');
 CREATE TABLE production_card_overrides(card_source_id TEXT,deleted_at TEXT);`);
 db.exec(await readFile('migrations/0050_production_card_signals.sql','utf8'));
 const env={GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',TG_DATA:{prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return db.prepare(sql).run(...args);}};}}};
 const request=(body,id='card',auth=true,origin)=>onRequestPatch({env,params:{id},request:new Request('http://localhost/api/signal',{method:'PATCH',headers:{...(auth?{cookie:'tg_admin=test'}:{}),...(origin?{origin}:{})},body:JSON.stringify(body)})});
 const valid={attention:'Casting options provided',filmingOn:'2026-11-21'};
 try {
 assert.equal((await request(valid,'card',false)).status,401);
 assert.equal((await request(valid,'card',true,'https://other.test')).status,403);
 assert.equal((await request(valid,'missing')).status,404);
 assert.equal((await request({...valid,filmingOn:'2026-02-30'})).status,400);
 assert.equal((await request({...valid,attention:'x'.repeat(81)})).status,400);
 assert.equal((await request({...valid,dismissRecent:'yes'})).status,400);
 assert.equal((await request({...valid,dismissRecent:true})).status,200);
 let saved=db.prepare('SELECT * FROM production_card_signals').get(); assert.equal(saved.attention,valid.attention); assert.ok(saved.dismissed_at);
 assert.equal((await request({attention:'',filmingOn:''})).status,200);
 assert.equal(db.prepare('SELECT * FROM production_card_signals').get().dismissed_at,saved.dismissed_at);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM production_card_signals WHERE card_source_id='other-source'").get().n,0);
 assert.equal((await request(valid)).status,200);
 assert.equal((await request({...valid,filmingDates:['2026-11-22','2026-11-21'],appendFilmingDates:true})).status,200);
 assert.deepEqual(JSON.parse(db.prepare('SELECT filming_on FROM production_card_signals').get().filming_on),['2026-11-21','2026-11-22']);
 assert.equal((await request({...valid,filmingDates:['2026-11-23'],appendFilmingDates:true})).status,200);
 assert.deepEqual(JSON.parse(db.prepare('SELECT filming_on FROM production_card_signals').get().filming_on),['2026-11-21','2026-11-22','2026-11-23']);
 assert.equal((await request({...valid,filmingDates:['2026-11-22']})).status,200);
 assert.deepEqual(JSON.parse(db.prepare('SELECT filming_on FROM production_card_signals').get().filming_on),['2026-11-22']);
 assert.equal((await request({...valid,filmingDates:['2026-02-30']})).status,400);
 db.exec("INSERT INTO production_card_overrides VALUES('source','deleted')");
 assert.equal((await request(valid)).status,404);
 } finally {db.close();}
});

const { suggestCommentDates } = await import(pathToFileURL(join(dir,'dates.mjs')));
const { addProductionComment } = await import(pathToFileURL(join(dir,'commands.mjs')));
test('date suggestions include ordinary dates, deduplicate, infer visible year and reject invalid dates',()=>{
 assert.deepEqual(suggestCommentDates('Meet 1/21/27, deliver January 25, 2027. Ref 2027-01-21',now),['2027-01-21','2027-01-25']);
 assert.deepEqual(suggestCommentDates('Maybe November 25 or 11/26?',now),['2026-11-25','2026-11-26']);
 assert.deepEqual(suggestCommentDates('2/30/27 and 13/21/27',now),[]);
 assert.deepEqual(suggestCommentDates([{children:[{text:'On '},{text:'1/21/27'}]}],now),['2027-01-21']);
});
test('comment and confirmed meanings save together without replacing other signals',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE production_cards(id TEXT,source_id TEXT UNIQUE); INSERT INTO production_cards VALUES('card','source');
 CREATE TABLE production_local_comments(id TEXT,card_source_id TEXT,body_html TEXT,body_json TEXT,author_name TEXT,author_email TEXT,created_at TEXT,is_question INTEGER DEFAULT 0,question_resolved_at TEXT,deleted_at TEXT);
 CREATE TABLE production_card_overrides(card_source_id TEXT PRIMARY KEY,due_on TEXT,edited_at TEXT,deleted_at TEXT);`);
 db.exec(await readFile('migrations/0050_production_card_signals.sql','utf8'));
 const env={TG_DATA:{prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args);},async run(){return db.prepare(sql).run(...args);}};}, async batch(statements){db.exec('BEGIN');try {for(const statement of statements)await statement.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}}};
 const input={get requestId(){return crypto.randomUUID()},bodyHtml:'<p>Filming 1/21/27</p>',bodyJson:'[]'};
 db.exec(await readFile('migrations/0059_comment_retries.sql','utf8'));
 const actor={name:'Test',email:null};
 try {
 await addProductionComment(env,'card',input,actor);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM production_card_signals').get().n,0);
 await addProductionComment(env,'card',{...input,signal:{filmingOn:'2027-01-21',attention:'Casting ready'}},actor);
 await addProductionComment(env,'card',{...input,signal:{dueOn:'2027-01-25'}},actor);
 const signal=db.prepare('SELECT * FROM production_card_signals').get();
 assert.deepEqual(JSON.parse(signal.filming_on),['2027-01-21']);assert.equal(signal.attention,'Casting ready');
 assert.equal(db.prepare('SELECT due_on FROM production_card_overrides').get().due_on,'2027-01-25');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM production_local_comments').get().n,3);
 await addProductionComment(env,'card',{...input,signal:{filmingDates:['2027-01-23','2027-01-21']}},actor);
 assert.deepEqual(JSON.parse(db.prepare('SELECT filming_on FROM production_card_signals').get().filming_on),['2027-01-21','2027-01-23']);
 }finally{db.close();}
});

test('multiple filming dates produce one chip based on the nearest upcoming day',()=>{
 assert.equal(cardSignal({filmingOn:JSON.stringify(['2026-11-19','2026-11-21','2026-11-23','2026-11-21'])},now).label,'Filming Nov 21 +1');
 assert.equal(cardSignal({filmingOn:JSON.stringify(['2026-11-19','2026-11-18'])},now),null);
 assert.equal(cardSignal({filmingOn:JSON.stringify(['2026-11-25','2026-11-29']),attention:'Casting ready'},now).label,'Casting ready');
});
