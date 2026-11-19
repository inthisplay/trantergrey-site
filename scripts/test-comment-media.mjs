import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const dir = await mkdtemp(join(tmpdir(), 'tg-comment-media-'));
for (const [name,path] of Object.entries({api:'functions/api/admin/production-board/[id]/comment-media.ts',html:'lib/production-comment-html.ts'})) await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',outfile:join(dir,name+'.mjs')});
const {onRequest}=await import(pathToFileURL(join(dir,'api.mjs')));
const {slateHtml}=await import(pathToFileURL(join(dir,'html.mjs')));
after(()=>rm(dir,{recursive:true,force:true}));
const migration=await readFile('migrations/0036_comment_media_decisions.sql','utf8');
const url='/api/admin/production-board/attachments/local-attachment-12345678901234567890';
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE admin_sessions(id TEXT,user_name TEXT,user_email TEXT,expires_at TEXT); INSERT INTO admin_sessions VALUES('test','Reviewer','reviewer@example.com','9999');
 CREATE TABLE production_cards(id TEXT,source_id TEXT UNIQUE); INSERT INTO production_cards VALUES('card','source'),('other','elsewhere');
 CREATE TABLE production_card_overrides(card_source_id TEXT,deleted_at TEXT);
 CREATE TABLE production_comments(source_id TEXT,card_source_id TEXT,body_html TEXT);
 CREATE TABLE production_local_comments(id TEXT,card_source_id TEXT,body_html TEXT,deleted_at TEXT);`);db.exec(migration);
 const html=`<figure class="production-comment-upload"><img src="${url}" alt="Actor &amp; audition"></figure><iframe src="https://player.mux.com/abcdef12345"></iframe>`;
 db.prepare('INSERT INTO production_comments VALUES(?,?,?)').run('original','source',html);
 db.prepare('INSERT INTO production_local_comments VALUES(?,?,?,NULL)').run('localid','source',html);
 const env={ADMIN_PASSWORD:'test',TG_DATA:{prepare(sql){let args=[];return{bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};}}};
 const call=(method='GET',body={},card='card',auth=true,origin)=>onRequest({env,params:{id:card},request:new Request('http://localhost/media?comment='+encodeURIComponent(body.commentKey||'comment-original'),{method,headers:{...(auth?{cookie:'tg_admin=test'}:{}),...(origin?{origin}:{})},...(method!=='GET'?{body:JSON.stringify({commentKey:'comment-original',url,...body})}:{})})});
 return{db,call};
}
test('shared decisions persist, switch and clear while staying isolated to card and comment',async()=>{
 const {db,call}=fixture();try{
 assert.equal((await call('GET',{},'card',false)).status,401);
 assert.equal((await call('PATCH',{decision:'highlight'},'other')).status,404);
 assert.equal((await call('PATCH',{decision:'highlight'},'card',true,'https://evil.test')).status,403);
 assert.equal((await call('PATCH',{decision:'unknown'})).status,400);
 assert.equal((await call('PATCH',{decision:'reject',url:'https://elsewhere.test/photo.jpg'})).status,404);
 assert.equal((await call('PATCH',{decision:'highlight'})).status,200);
 let data=await (await call()).json();assert.equal(data.decisions[0].decision,'highlight');assert.equal(data.decisions[0].decidedBy,'Reviewer');
 assert.equal((await (await call('GET',{commentKey:'local-localid'})).json()).decisions.length,0);
 await call('PATCH',{decision:'reject'});data=await (await call()).json();assert.equal(data.decisions.length,1);assert.equal(data.decisions[0].decision,'reject');
 await call('PATCH',{decision:null});assert.equal((await (await call()).json()).decisions.length,0);
 db.exec("UPDATE production_local_comments SET deleted_at='now'");assert.equal((await call('PATCH',{commentKey:'local-localid',decision:'highlight'})).status,404);
 }finally{db.close();}
});
test('copy returns a draft block without posting, keeps media intact, and excludes Mux',async()=>{
 const {db,call}=fixture();try{
 const response=await call('POST',{action:'copy'});assert.equal(response.status,200);
 const {block}=await response.json();assert.equal(block.url,url);assert.equal(block.title,'Actor & audition');assert.equal(block.type,'comment-media');
 const html=slateHtml([block]);assert.ok(html.includes(url));assert.ok(html.includes('Actor &amp; audition'));
 assert.equal(db.prepare('SELECT count(*) n FROM production_local_comments').get().n,1);
 assert.equal((await call('POST',{action:'copy',url:'https://player.mux.com/abcdef12345'})).status,404);
 assert.equal(slateHtml([{...block,url:'javascript:alert(1)'}]),'');
 assert.equal(slateHtml([{...block,mediaKind:'iframe',url:'https://evil.test/'}]),'');
 }finally{db.close();}
});
