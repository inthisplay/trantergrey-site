import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const dir = await mkdtemp(join(tmpdir(), 'tg-gallery-'));
await build({ entryPoints: ['functions/api/admin/production-board/[id]/gallery.ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'api.mjs') });
await build({ entryPoints: ['functions/api/admin/production-board/[id]/gallery/[media].ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'file.mjs') });
const { onRequest } = await import(pathToFileURL(join(dir, 'api.mjs')));
const { onRequestGet } = await import(pathToFileURL(join(dir, 'file.mjs')));
after(() => rm(dir, { recursive: true, force: true }));
const migration = await readFile('migrations/0035_card_media_gallery.sql', 'utf8');
const rolodexMigration = await readFile('migrations/0037_rolodex.sql', 'utf8');
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE admin_sessions(id TEXT,user_name TEXT,user_email TEXT,expires_at TEXT);
    INSERT INTO admin_sessions VALUES('test','Team member','team@example.com','9999');
    CREATE TABLE production_cards(id TEXT,source_id TEXT UNIQUE); INSERT INTO production_cards VALUES('card','source'),('other','other-source');
    CREATE TABLE production_card_overrides(card_source_id TEXT,deleted_at TEXT);`);
  db.exec(migration);
  db.exec(rolodexMigration);
  const objects = new Map();
  const env = { GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture', TG_DATA: { prepare(sql) { let args = []; return { bind(...values) { args=values; return this; }, async first() { return db.prepare(sql).get(...args) || null; }, async all() { return { results: db.prepare(sql).all(...args) }; }, async run() { return db.prepare(sql).run(...args); } }; } }, PRODUCTION_ARCHIVE: { async put(key, value) { objects.set(key, value); }, async get(key, options) { const data=objects.get(key); if(!data)return null; const chunk=options?.range ? data.slice(options.range.offset, options.range.offset+options.range.length) : data; return {body:new Blob([chunk]).stream(),size:data.length,...(options?.range ? {range:options.range}: {})}; } } };
  const request = (method='GET', body, card='card', auth=true, extra={}) => onRequest({env,params:{id:card},request:new Request('http://localhost/api/gallery',{method,headers:{...(auth?{cookie:'tg_admin=test'}:{}),...extra},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})})});
  const upload = () => request('POST','test','card',true,{'content-type':'image/png','x-file-size':'4','x-file-name':'Actor.png'});
  return {db,env,request,upload,objects};
}
test('gallery upload, metadata, approval ordering, isolation, removal and private file access',async()=>{
 const {db,env,request,upload,objects}=fixture();
 try {
  assert.equal((await request('GET',undefined,'card',false)).status,401);
  assert.equal((await request('POST','test','card',true,{origin:'https://other.test'})).status,403);
  assert.equal((await request('GET',undefined,'missing')).status,404);
  const a=await (await upload()).json(); const b=await (await upload()).json(); assert.ok(a.id&&b.id); assert.equal(objects.size,2);
  assert.equal((await request('PATCH',{id:a.id,title:'Jane Smith',tags:['Mom','mom',' Teacher '],approved:true})).status,200);
  let items=(await (await request()).json()).items;
  assert.equal(items[0].id,a.id); assert.equal(items[0].title,'Jane Smith'); assert.deepEqual(items[0].tags,['mom','teacher']); assert.equal(items[0].approvedBy,'Team member');
  assert.equal((await request('PATCH',{id:a.id,title:'wrong'},'other')).status,404);
  assert.equal((await request('PATCH',{id:a.id,title:' '})).status,400);
  assert.equal((await request('PATCH',{id:a.id,tags:[123]})).status,400);
  assert.equal((await request('PATCH',{id:a.id,approved:'yes'})).status,400);
  const file=(card,auth=true,range)=>onRequestGet({env,params:{id:card,media:a.id},request:new Request('http://localhost/file',{headers:{...(auth?{cookie:'tg_admin=test'}:{}),...(range?{range}:{})}})});
  assert.equal((await file('card',false)).status,401); assert.equal((await file('other')).status,404);
  assert.equal(await (await file('card')).text(),'test'); const partial=await file('card',true,'bytes=1-2');assert.equal(partial.status,206);assert.equal(await partial.text(),'es');
  await request('PATCH',{id:a.id,approved:false});items=(await (await request()).json()).items;assert.equal(items.find(i=>i.id===a.id).approvedAt,null);
  await request('DELETE',{id:a.id});assert.equal((await file('card')).status,404);assert.equal((await (await request()).json()).items.length,1);
  db.exec("INSERT INTO production_card_overrides VALUES('source','deleted')");assert.equal((await request()).status,404);
 } finally {db.close();}
});
test('invalid types, sizes and truncated uploads are rejected without creating records',async()=>{
 const {db,request,objects}=fixture();try{
 for(const [headers,status] of [[{'content-type':'image/svg+xml','x-file-size':'4'},415],[{'content-type':'image/png','x-file-size':'999999999'},413],[{'content-type':'image/png','x-file-size':'2'},413],[{'content-type':'image/png','x-file-size':'5'},400]]) assert.equal((await request('POST','test','card',true,headers)).status,status);
 assert.equal(objects.size,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM production_gallery').get().n,0);
 }finally{db.close();}
});

test('casting resolves the clicked profile media by stored file, even after the cover changes', async () => {
 const {db,request,upload}=fixture();
 try {
  const {id}=await (await upload()).json();
  const {r2_key}=db.prepare('SELECT r2_key FROM production_gallery WHERE id=?').get(id);
  db.exec("INSERT INTO rolodex_people(id,name,cover_media_id,created_at,updated_at) VALUES('person','Actor','new-cover','now','now')");
  db.prepare("INSERT INTO rolodex_media(id,person_id,title,kind,r2_key,created_at) VALUES('original','person','Headshot','upload',?,'now')").run(r2_key);
  db.prepare('UPDATE production_gallery SET rolodex_person_id=? WHERE id=?').run('person',id);
  let item=(await (await request()).json()).items[0];
  assert.equal(item.rolodexPersonId,'person');assert.equal(item.rolodexMediaId,'original');
  // Media saved from Casting can be associated through its source gallery too.
  db.prepare('UPDATE production_gallery SET rolodex_person_id=NULL WHERE id=?').run(id);
  db.prepare("UPDATE rolodex_media SET source_gallery_id=? WHERE id='original'").run(id);
  item=(await (await request()).json()).items[0];
  assert.equal(item.rolodexPersonId,'person');assert.equal(item.rolodexMediaId,'original');
  db.exec("UPDATE rolodex_media SET deleted_at='now'");
  item=(await (await request()).json()).items[0];assert.equal(item.rolodexMediaId,null);
 } finally { db.close(); }
});
