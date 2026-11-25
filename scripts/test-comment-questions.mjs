import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const dir = await mkdtemp(join(tmpdir(),'tg-questions-'));
for(const [name,path] of [['parser','lib/comment-question.ts'],['api','functions/api/admin/production-board/[id]/questions.ts'],['comments','functions/api/admin/production-board/[id]/comments.ts'],['rules','lib/card-signal.ts']])await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',banner:{js:"import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"},outfile:join(dir,name+'.mjs')});
const {hasCommentQuestion}=await import(pathToFileURL(join(dir,'parser.mjs')));
const {onRequestPatch}=await import(pathToFileURL(join(dir,'api.mjs')));
const comments=await import(pathToFileURL(join(dir,'comments.mjs')));
const {cardSignal}=await import(pathToFileURL(join(dir,'rules.mjs')));
after(()=>rm(dir,{recursive:true,force:true}));
test('questions detect visible text, not links, markup, quotes or code',()=>{
 for(const text of ['<p>Can we film Tuesday?</p>','<p>Who is <strong>available</strong>?</p>','<p>Ready&#63;</p>'])assert.equal(hasCommentQuestion(text),true);
 for(const text of ['<p>Ready to film.</p>','<p>?</p>','<a href="https://example.com/?id=1">Review here</a>','https://example.com/?id=1','<blockquote>Ready?</blockquote>','<code>ready ? yes : no</code>'])assert.equal(hasCommentQuestion(text),false);
});
test('question chips keep author and exact target, and fit the priority rules',()=>{
 const question={openQuestion:JSON.stringify({id:'123',author:'Greyson Duncan'})};const now=new Date('2026-11-20T17:00:00Z');
 assert.deepEqual(cardSignal(question,now),{kind:'attention',label:'Greyson asked a question',target:'comment-local-123'});
 assert.equal(cardSignal({...question,filmingOn:'2026-11-25'},now).label,'Greyson asked a question');
 assert.equal(cardSignal({...question,filmingOn:'2026-11-21'},now).label,'Filming Nov 21');
 assert.equal(cardSignal({...question,attention:'Review casting'},now).label,'Review casting');
 assert.equal(cardSignal({...question,archived:1},now),null);
});
test('posting, resolving, reopening, editing and deleting a question updates board eligibility',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE admin_sessions(id TEXT,user_name TEXT,user_email TEXT,expires_at TEXT);
 INSERT INTO admin_sessions VALUES('test','Greyson Duncan','greyson@example.com','9999');
 CREATE TABLE production_cards(id TEXT,source_id TEXT UNIQUE); INSERT INTO production_cards VALUES('card','source'),('other','other-source');
 CREATE TABLE production_card_overrides(card_source_id TEXT,deleted_at TEXT);
 CREATE TABLE production_local_comments(id TEXT,card_source_id TEXT,body_html TEXT,body_json TEXT,author_name TEXT,author_email TEXT,created_at TEXT,deleted_at TEXT,deleted_by_name TEXT);`);
 db.exec(await readFile('migrations/0051_comment_questions.sql','utf8'));
 db.exec(await readFile('migrations/0059_comment_retries.sql','utf8'));
 const env={GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',TG_DATA:{prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return db.prepare(sql).run(...args);}};}}};
 env.TG_DATA.batch=async statements=>{db.exec('BEGIN');try{for(const statement of statements)await statement.run();db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error;}};
 const req=(fn,body,id='card',auth=true,origin)=>fn({env,params:{id},request:new Request('http://localhost/api/comments',{method:'POST',headers:{...(auth?{cookie:'tg_admin=test'}:{}),...(origin?{origin}:{})},body:JSON.stringify({requestId:crypto.randomUUID(),...body})})});
 const content=text=>[{type:'paragraph',children:[{text}]}];
 const open=()=>db.prepare('SELECT id FROM production_local_comments WHERE is_question=1 AND question_resolved_at IS NULL AND deleted_at IS NULL').all();
 try {
 let response=await req(comments.onRequestPost,{body:content('Can we film Tuesday?')});assert.equal(response.status,201);
 const {localComment}=await response.json();assert.equal(localComment.isQuestion,1);assert.equal(open().length,1);
 const action={commentId:localComment.id,addressed:true};
 assert.equal((await req(onRequestPatch,action,'card',false)).status,401);
 assert.equal((await req(onRequestPatch,action,'other')).status,404);
 assert.equal((await req(onRequestPatch,action,'card',true,'https://other.test')).status,403);
 assert.equal((await req(onRequestPatch,action)).status,200);assert.equal(open().length,0);
 assert.equal((await req(onRequestPatch,{...action,addressed:false})).status,200);assert.equal(open().length,1);
 assert.equal((await req(comments.onRequestPatch,{commentId:localComment.id,body:content('Tuesday is confirmed.')})).status,200);assert.equal(open().length,0);
 assert.equal((await req(comments.onRequestPatch,{commentId:localComment.id,body:content('Who can film Tuesday?')})).status,200);assert.equal(open().length,1);
 assert.equal((await req(comments.onRequestDelete,{commentId:localComment.id})).status,200);assert.equal(open().length,0);
 assert.equal((await req(onRequestPatch,action)).status,404);
 }finally{db.close();}
});
