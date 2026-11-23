import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const dir=await mkdtemp(join(tmpdir(),'tg-previews-'));
for(const [name,path] of Object.entries({worker:'workers/media-optimizer/index.ts',helper:'functions/_lib/media-previews.ts',url:'lib/media-preview.ts',route:'functions/api/admin/rolodex/media/[media].ts'})) await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',outfile:join(dir,`${name}.mjs`)});
const {optimize,MONTHLY_LIMIT}=await import(pathToFileURL(join(dir,'worker.mjs')));
const {mediaPreviewResponse,prepareMediaPreviews}=await import(pathToFileURL(join(dir,'helper.mjs')));
const {mediaVariantUrl,mediaPosterUrl}=await import(pathToFileURL(join(dir,'url.mjs')));
const {onRequestGet}=await import(pathToFileURL(join(dir,'route.mjs')));
after(()=>rm(dir,{recursive:true,force:true}));
const migration=await readFile('migrations/0043_media_previews.sql','utf8');
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE rolodex_media(id TEXT,person_id TEXT,filename TEXT,r2_key TEXT,content_type TEXT,kind TEXT,deleted_at TEXT);
 CREATE TABLE rolodex_people(id TEXT,deleted_at TEXT); INSERT INTO rolodex_people VALUES('actor',NULL);
 CREATE TABLE production_gallery(r2_key TEXT,content_type TEXT,deleted_at TEXT);
 CREATE TABLE production_attachments(r2_key TEXT,content_type TEXT,status TEXT);
 CREATE TABLE admin_sessions(id TEXT,user_name TEXT,user_email TEXT,expires_at TEXT);INSERT INTO admin_sessions VALUES('test','Team','team@example.com','9999');
 INSERT INTO rolodex_media VALUES('photo','actor','Original.png','photo','image/png','upload',NULL),('video','actor','Original.mov','video','video/quicktime','upload',NULL);`);
 db.exec(migration);
 const objects=new Map([['photo',new Uint8Array(1000)],['video',new Uint8Array(5000)]]);let transforms=0;
 const transform={input(){return{transform(){return{output(){transforms++;return{response:()=>new Response(new Uint8Array(50))};}};}};}};
 const env={GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',TG_DATA:{prepare(sql){let args=[];return{bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};}},PRODUCTION_ARCHIVE:{async get(key){const bytes=objects.get(key);return bytes?{body:new Blob([bytes]).stream(),size:bytes.byteLength}:null;},async put(key,bytes){objects.set(key,new Uint8Array(bytes));}},IMAGES:transform,MEDIA:transform};
 env.MEDIA_OPTIMIZER={async fetch(url,init){const b=JSON.parse(init.body);return Response.json(await optimize(env,b.key,b.variant));}};
 return{db,env,objects,count:()=>transforms};
}
test('concurrent requests generate once; smaller derivatives preserve originals; posters never download videos',async()=>{
 const {db,env,objects,count}=fixture();try{
 const original=objects.get('photo');await Promise.all([optimize(env,'photo','thumb'),optimize(env,'photo','thumb')]);
 assert.equal(count(),1);assert.equal(objects.get('photo'),original);assert.equal(original.byteLength,1000);
 await optimize(env,'photo','thumb');assert.equal(count(),1);
 const response=await mediaPreviewResponse(new Request('https://test/file?variant=thumb'),env,'photo','image/png');
 assert.equal(response.headers.get('content-type'),'image/webp');assert.match(response.headers.get('cache-control'),/^private/);assert.equal((await response.arrayBuffer()).byteLength,50);
 await prepareMediaPreviews(env,'video','video/quicktime');assert.equal(count(),2);assert.equal(objects.get('video').byteLength,5000);
 assert.equal((await mediaPreviewResponse(new Request('https://test/file?variant=poster'),env,'video','video/quicktime')).headers.get('content-type'),'image/jpeg');
 }finally{db.close();}
});
test('free budget defers safely; unknown files and unsupported variants consume no transforms',async()=>{
 const {db,env,count}=fixture();try{
 db.prepare('INSERT INTO media_transform_budget VALUES(?,?)').run(new Date().toISOString().slice(0,7),MONTHLY_LIMIT);
 assert.equal((await optimize(env,'photo','thumb')).status,'deferred');assert.equal(count(),0);
 assert.equal((await optimize(env,'unknown','thumb')).status,'missing');assert.equal((await optimize(env,'video','thumb')).status,'unsupported');
 const poster=await mediaPreviewResponse(new Request('https://test/file?variant=poster'),env,'video','video/quicktime');assert.equal(poster.headers.get('content-type'),'image/svg+xml');assert.equal(count(),0);
 assert.equal(await mediaPreviewResponse(new Request('https://test/file?variant=thumb'),env,'photo','image/png'),null);
 assert.equal((await mediaPreviewResponse(new Request('https://test/file?variant=arbitrary'),env,'photo','image/png')).status,400);
 }finally{db.close();}
});
test('failure backs off and upload preparation does not fail; transport outages retain originals',async()=>{
 const {db,env,count}=fixture();try{
 env.IMAGES={input(){throw new Error('Unsupported source');}};
 assert.equal((await optimize(env,'photo','thumb')).status,'failed');assert.equal((await optimize(env,'photo','thumb')).status,'failed');
 assert.equal(db.prepare('SELECT attempts FROM media_transform_budget').get().attempts,1);
 env.MEDIA_OPTIMIZER={fetch:async()=>new Response('unavailable',{status:503})};await prepareMediaPreviews(env,'photo','image/png');assert.equal(count(),0);
 }finally{db.close();}
});
test('preview authorization and deletion checks precede generation; original endpoint remains unchanged',async()=>{
 const {db,env,count}=fixture();try{
 const call=(auth=true,variant=true)=>onRequestGet({env,params:{media:'photo'},request:new Request('https://test/file'+(variant?'?variant=thumb':''),{headers:auth?{cookie:'tg_admin=test'}:{}})});
 assert.equal((await call(false)).status,401);assert.equal(count(),0);
 assert.equal((await call()).status,200);assert.equal(count(),1);
 const original=await call(true,false);assert.equal(original.headers.get('content-type'),'image/png');assert.equal((await original.arrayBuffer()).byteLength,1000);
 db.exec("UPDATE rolodex_people SET deleted_at='now'");assert.equal((await call()).status,404);assert.equal(count(),1);
 }finally{db.close();}
});
test('preview URL generation leaves remote media and canonical original URLs intact',()=>{
 assert.equal(mediaVariantUrl('/api/admin/rolodex/media/photo','thumb'),'/api/admin/rolodex/media/photo?variant=thumb');
 assert.equal(mediaVariantUrl('/api/admin/production-board/card/gallery/photo#t=0.1','poster'),'/api/admin/production-board/card/gallery/photo?variant=poster');
 assert.equal(mediaVariantUrl('https://image.mux.com/a/thumbnail.jpg','thumb'),'https://image.mux.com/a/thumbnail.jpg');
 assert.equal(mediaPosterUrl('https://example.com/video.mp4'),undefined);
});
