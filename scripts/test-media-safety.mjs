import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const dir=await mkdtemp(join(tmpdir(),'tg-media-safety-'));
const modules={};
for(const [name,path] of Object.entries({replace:'functions/_lib/replace-video.ts',route:'functions/api/admin/mux-assets/replace.ts',cleanup:'functions/_lib/catalog-retention.ts',mux:'functions/_lib/mux.ts',attachment:'functions/api/admin/production-board/attachments/[id].ts',upload:'functions/api/admin/production-board/[id]/attachments.ts'})) {
 await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',outfile:join(dir,name+'.mjs')});
 modules[name]=await import(pathToFileURL(join(dir,name+'.mjs')));
}
after(()=>rm(dir,{recursive:true,force:true}));
const migration=await readFile('migrations/0058_media_safety.sql','utf8');
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE admin_sessions(id TEXT,user_name TEXT,user_email TEXT,expires_at TEXT);
 INSERT INTO admin_sessions VALUES('test','Fixture','fixture@trantergrey.com','9999');
 CREATE TABLE production_cards(id TEXT PRIMARY KEY,source_id TEXT); INSERT INTO production_cards VALUES('card','source'),('other','other');
 CREATE TABLE production_card_overrides(card_source_id TEXT,deleted_at TEXT);
 CREATE TABLE mux_video_projects(id TEXT PRIMARY KEY,slug TEXT UNIQUE,value TEXT,created_at TEXT,updated_at TEXT);
 CREATE TABLE mux_video_collections(value TEXT,updated_at TEXT);
 CREATE TABLE mux_asset_metadata(asset_id TEXT PRIMARY KEY,title TEXT,client TEXT,tags TEXT,status TEXT,thumbnail_time REAL,downloads_enabled INTEGER,updated_at TEXT);
 CREATE TABLE production_attachments(source_id TEXT,filename TEXT,content_type TEXT,r2_key TEXT,status TEXT);
 `);
 for(const name of ['0017_internal_api_foundation','0018_mux_library_snapshot','0019_mux_library_browse_index'])db.exec(schemas[name]);
 db.exec(migration);
 db.exec(`INSERT INTO mux_library_snapshot_state VALUES('library','active','2026-01-01'); INSERT INTO mux_library_browse_state VALUES('library','active','2026-01-01',1);
 INSERT INTO mux_asset_metadata VALUES('old','Saved title','Client','["tag"]','published',2,0,'now');
 INSERT INTO production_card_video_links(id,card_id,asset_id,linked_at,linked_by_type,linked_by_id) VALUES('link','card','old','now','user','fixture'),('duplicate','other','old','now','user','fixture'),('target','other','new','now','user','fixture');
 INSERT INTO production_card_activity(id,card_id,event_type,occurred_at,actor_type,actor_id,asset_id,link_id) VALUES('history','other','video_linked','now','user','fixture','old','duplicate'),('target-history','other','video_linked','now','user','fixture','new','target');`);
 const project={id:'page',slug:'stable-url',title:'Page',client:'Client',description:'Brief',variants:[{assetId:'old',label:'Horizontal',order:0}],collectionIds:[],createdAt:'now',updatedAt:'now'};
 db.prepare('INSERT INTO mux_video_projects VALUES(?,?,?,?,?)').run(project.id,project.slug,JSON.stringify(project),'now','now');
 let fail=false,race;
 const env={GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',MUX_TOKEN_ID:'fixture',MUX_TOKEN_SECRET:'fixture',TG_DATA:{prepare(sql){let values=[];return {bind(...v){values=v;return this},async first(){return db.prepare(sql).get(...values)||null},async all(){return {results:db.prepare(sql).all(...values)}},async run(){return db.prepare(sql).run(...values)},execute(){return db.prepare(sql).all(...values)}}},async batch(stmts){race?.();race=null;db.exec('BEGIN');try{for(let i=0;i<stmts.length;i++){if(fail&&i===4)throw Error('injected');stmts[i].execute()}db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}}};
 return {db,env,fail:()=>{fail=true},race:fn=>{race=fn}};
}
const schemas={};for(const name of ['0017_internal_api_foundation','0018_mux_library_snapshot','0019_mux_library_browse_index'])schemas[name]=await readFile('migrations/'+name+'.sql','utf8');
const originalFetch=globalThis.fetch;
const requests=[];
globalThis.fetch=async(url,init)=>{requests.push({url:String(url),method:init?.method||'GET'});if(String(url).includes('assets?'))return Response.json({data:[{id:'fresh',status:'ready'}]});const id=String(url).split('/').at(-1);return Response.json({data:{id,title:'Fixture',status:'ready',created_at:1,playback_ids:[{id:'play',policy:'public'}]}})};
after(()=>{globalThis.fetch=originalFetch});
test('replacement retains originals, migrates links, preserves history, and retries without another Mux call',async()=>{
 const f=fixture();try{
 const result=await modules.replace.replaceVideo(f.env,'old','new','fixture');
 assert.equal(result.originalRetained,true);assert.equal(result.project.slug,'stable-url');
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM production_card_video_links WHERE asset_id='old'").get().n,0);
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM production_card_video_links WHERE asset_id='new'").get().n,2);
 assert.equal(f.db.prepare("SELECT asset_id FROM production_card_activity WHERE id='history'").get().asset_id,'old');
 assert.equal(f.db.prepare("SELECT downloads_enabled FROM mux_asset_metadata WHERE asset_id='new'").get().downloads_enabled,0);
 const count=requests.length;assert.equal((await modules.replace.replaceVideo(f.env,'old','new','fixture')).replayed,true);assert.equal(requests.length,count);
 assert.ok(requests.every(r=>r.method==='GET'));
 await assert.rejects(()=>modules.replace.replaceVideo(f.env,'old','different','fixture'),/already replaced/);
 }finally{f.db.close()}
});
test('same asset is rejected before any external request; database failure and concurrent edits leave original intact',async()=>{
 const f=fixture();try{const count=requests.length;await assert.rejects(()=>modules.replace.replaceVideo(f.env,'old','old','fixture'),/different/);assert.equal(requests.length,count);
 f.fail();await assert.rejects(()=>modules.replace.replaceVideo(f.env,'old','new','fixture'));
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM mux_asset_replacements').get().n,0);
 assert.equal(JSON.parse(f.db.prepare('SELECT value FROM mux_video_projects').get().value).variants[0].assetId,'old');
 }finally{f.db.close()}
 const g=fixture();try{g.race(()=>g.db.exec("UPDATE mux_video_projects SET value=json_set(value,'$.title','Concurrent edit')"));await assert.rejects(()=>modules.replace.replaceVideo(g.env,'old','new','fixture'));assert.equal(g.db.prepare('SELECT COUNT(*) n FROM mux_asset_replacements').get().n,0);}finally{g.db.close()}
});
test('replacement route rejects anonymous, foreign-origin and oversized requests',async()=>{
 const f=fixture();try{
 const call=(headers,body='{}')=>modules.route.onRequestPost({env:f.env,request:new Request('https://fixture.test/api/replace',{method:'POST',headers,body})});
 assert.equal((await call({})).status,401);
 assert.equal((await call({cookie:'tg_admin=test',origin:'https://evil.test'})).status,403);
 assert.equal((await call({cookie:'tg_admin=test'},'x'.repeat(2049))).status,413);
 }finally{f.db.close()}
});
test('retention removes only expired inactive rows, bounded per table, including full-text rows',async()=>{
 const f=fixture();try{
 for(const id of ['active','expired','building']){
 const stamp=id==='building'?new Date().toISOString():'2020-01-01';
 for(const kind of ['snapshot','browse'])f.db.prepare('INSERT INTO mux_catalog_generations VALUES(?,?,?)').run(kind,id,stamp);
 for(let n=0;n<3;n++){
 f.db.prepare('INSERT INTO mux_library_assets VALUES(?,?,?,?)').run('a'+n,id,'{}',stamp);
 f.db.prepare('INSERT INTO mux_library_browse_assets VALUES(?,?,?,?,?,?,?,?,?)').run('a'+n,id,'title','client','published','now',0,'text','{}');
 f.db.prepare('INSERT INTO mux_library_browse_search VALUES(?,?,?)').run('a'+n,id,'text');
 }}
 await modules.cleanup.cleanupCatalogSnapshots(f.env,2);
 for(const table of ['mux_library_assets','mux_library_browse_assets','mux_library_browse_search']){
 assert.equal(f.db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE refresh_id='expired'`).get().n,1);
 assert.equal(f.db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE refresh_id IN ('active','building')`).get().n,6);
 }
 await modules.cleanup.cleanupCatalogSnapshots(f.env,2);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM mux_catalog_generations WHERE refresh_id='expired'").get().n,0);
 }finally{f.db.close()}
});
test('existing active-content attachments download sandboxed, new SVG uploads are rejected',async()=>{
 const f=fixture();try{
 f.db.exec("INSERT INTO production_attachments VALUES('svg','unsafe.svg','image/svg+xml','file','stored')");
 f.env.PRODUCTION_ARCHIVE={get:async()=>({body:new Response('<svg><script>marker</script></svg>').body,size:33})};
 const request=new Request('https://fixture.test/file',{headers:{cookie:'tg_admin=test'}});
 const response=await modules.attachment.onRequestGet({env:f.env,request,params:{id:'svg'}});
 assert.match(response.headers.get('content-disposition'),/^attachment/);assert.match(response.headers.get('content-security-policy'),/sandbox/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 const upload=await modules.upload.onRequestPost({env:f.env,params:{id:'card'},request:new Request('https://fixture.test/upload',{method:'POST',headers:{cookie:'tg_admin=test','content-type':'image/svg+xml','x-file-size':'4'},body:'test'})});assert.equal(upload.status,415);
 }finally{f.db.close()}
});
test('actual Workers runtime streams exact uploads and rejects both overflow and truncation',async()=>{
 const {outputFiles}=await build({stdin:{contents:`import {storePrivateUpload} from './functions/_lib/private-upload';export default {async fetch(request,env){try{await storePrivateUpload(env,request,'file',Number(request.headers.get('x-size')),'application/octet-stream');return new Response('ok')}catch(e){return new Response(e.message,{status:e.status||500})}}}`,resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'esm'});
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'fixture',modules:true,script:outputFiles[0].text,compatibilityDate:'2026-10-20',r2Buckets:['PRODUCTION_ARCHIVE']}]}));
 try{
 for(const [size,body,status] of [[4,'test',200],[3,'test',413],[5,'test',400]])assert.equal((await mf.dispatchFetch('https://fixture.test/',{method:'POST',headers:{'x-size':String(size)},body})).status,status);
 const object=await (await mf.getR2Bucket('PRODUCTION_ARCHIVE')).get('file');assert.equal(await object.text(),'test');
 }finally{await mf.dispose()}
});

test('invalidating the infinite-lived catalog really refreshes and records a new generation',async()=>{
 const f=fixture();try{
 f.db.prepare('INSERT INTO mux_library_assets VALUES(?,?,?,?)').run('stale','active',JSON.stringify({id:'stale'}),'2026-01-01');
 assert.equal((await modules.mux.getMuxLibraryAssets(f.env))[0].id,'stale');
 await modules.mux.invalidateMuxLibraryCache(f.env);
 assert.equal((await modules.mux.getMuxLibraryAssets(f.env))[0].id,'fresh');
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM mux_catalog_generations WHERE kind='snapshot'").get().n,1);
 }finally{f.db.close()}
});
