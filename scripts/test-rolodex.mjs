import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
globalThis.FixedLengthStream=class {
 constructor(size){let bytes=0;const stream=new TransformStream({transform(chunk,controller){bytes+=chunk.byteLength;if(bytes>size)throw new Error('Upload exceeds declared size');controller.enqueue(chunk);},flush(){if(bytes!==size)throw new Error('Upload was incomplete');}});this.readable=stream.readable;this.writable=stream.writable;}
};
const dir=await mkdtemp(join(tmpdir(),'tg-rolodex-'));
for(const [name,path] of Object.entries({api:'functions/api/admin/rolodex.ts',upload:'functions/api/admin/rolodex/upload.ts',file:'functions/api/admin/rolodex/media/[media].ts',shared:'lib/rolodex.ts'}))await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',outfile:join(dir,`${name}.mjs`)});
const {onRequest}=await import(pathToFileURL(join(dir,'api.mjs')));
const {onRequestPost}=await import(pathToFileURL(join(dir,'upload.mjs')));
const {onRequestGet}=await import(pathToFileURL(join(dir,'file.mjs')));
const {actualAge,castingAge}=await import(pathToFileURL(join(dir,'shared.mjs')));
const migration=await readFile('migrations/0035_card_media_gallery.sql','utf8');
const rolodex=await readFile('migrations/0037_rolodex.sql','utf8');
const ageOnlyMigration=await readFile('migrations/0042_rolodex_age_estimates.sql','utf8');
const ageMigration=await readFile('migrations/0041_rolodex_age.sql','utf8');
after(()=>rm(dir,{recursive:true,force:true}));
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE admin_sessions(id TEXT,user_name TEXT,user_email TEXT,expires_at TEXT);INSERT INTO admin_sessions VALUES('test','Team','team@example.com','9999');
 CREATE TABLE production_cards(id TEXT,source_id TEXT UNIQUE,title TEXT,archived INTEGER);INSERT INTO production_cards VALUES('card','source','Shoot A',0),('other','other-source','Shoot B',0);
 CREATE TABLE production_card_overrides(card_source_id TEXT,deleted_at TEXT,title TEXT,archived INTEGER);`);
 db.exec(migration);db.exec(rolodex);db.exec(ageMigration);db.exec(ageOnlyMigration);
 db.exec(`INSERT INTO production_gallery(id,card_source_id,filename,content_type,byte_size,r2_key,title,tags_json,approved_at,uploaded_by,created_at,updated_at) VALUES('original','source','actor.png','image/png',4,'photo','Alex','["dad"]','approved','Team','now','now');`);
 const objects=new Map([['photo',new TextEncoder().encode('test')]]);
 const env={ADMIN_PASSWORD:'test',TG_DATA:{prepare(sql){let args=[];return{bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};},async batch(statements){db.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}},PRODUCTION_ARCHIVE:{async put(key,data){objects.set(key,data instanceof ReadableStream?new Uint8Array(await new Response(data).arrayBuffer()):data);},async get(key,options){const data=objects.get(key);if(!data)return null;const chunk=options?.range?data.slice(options.range.offset,options.range.offset+options.range.length):data;return{body:new Blob([chunk]).stream(),size:data.length,...(options?.range?{range:options.range}:{})};}}};
 const call=(body,query='',headers={cookie:'tg_admin=test'})=>onRequest({env,request:new Request(`http://localhost/api/admin/rolodex${query}`,{method:body?'POST':'GET',headers, ...(body?{body:JSON.stringify(body)}:{})})});
 const file=(id,headers={cookie:'tg_admin=test'})=>onRequestGet({env,params:{media:id},request:new Request('http://localhost/file',{headers})});
 return{db,env,call,file,objects};
}
test('private profiles validate dates, preserve empty contacts, archive and restore',async()=>{
 const {db,call}=fixture();try{
 assert.equal((await call(null,'',{})).status,401);
 assert.equal((await call({action:'create',name:'Alex'},'',{cookie:'tg_admin=test',origin:'https://bad.test'})).status,403);
 assert.equal((await call({action:'create',name:' '})).status,400);
 const {id}=await(await call({action:'create',name:'Alex'})).json();
 for(const birthday of ['2024-02-30','9999-01-01','not-a-date'])assert.equal((await call({action:'update',id,birthday})).status,400);
 assert.equal((await call({action:'update',id,birthday:'1990-02-28',tags:['Actor','actor',' Comedy '],ethnicity:'Black',gender:'Male'})).status,200);
 let p=(await(await call(null,`?id=${id}`)).json()).person;assert.deepEqual(p.tags,['actor','comedy']);assert.equal(p.email,'');
 await call({action:'archive',id,archived:true});p=(await(await call()).json()).people[0];assert.ok(p.archivedAt);
 await call({action:'archive',id,archived:false});assert.equal((await(await call(null,`?id=${id}`)).json()).person.archivedAt,null);
 await call({action:'delete',id});assert.equal((await call(null,`?id=${id}`)).status,404);
 }finally{db.close();}
});
test('Casting imports deduplicate and retain media after source removal; bulk adds reset roles and approvals',async()=>{
 const {db,call,file}=fixture();try{
 const first=await(await call({action:'fromCasting',name:'Alex',galleryId:'original',cardId:'card'})).json();assert.ok(first.id);
 const second=await(await call({action:'fromCasting',name:'Alex',galleryId:'original',cardId:'card'})).json();assert.equal(second.id,first.id);
 const detail=await(await call(null,`?id=${first.id}`)).json();assert.equal(detail.media.length,1);assert.deepEqual(detail.person.tags,[]);assert.deepEqual(detail.history[0].tags,['dad']);assert.equal(detail.history[0].approvedAt,'approved');
 assert.equal((await file(detail.media[0].id,{})).status,401);assert.equal(await(await file(detail.media[0].id)).text(),'test');
 let result=await(await call({action:'addToCard',personIds:[first.id,first.id],cardId:'other'})).json();assert.equal(result.added,1);
 result=await(await call({action:'addToCard',personIds:[first.id],cardId:'other'})).json();assert.equal(result.existing,1);
 const copy=db.prepare("SELECT * FROM production_gallery WHERE card_source_id='other-source'").get();assert.equal(copy.title,'Alex');assert.equal(copy.tags_json,'[]');assert.equal(copy.approved_at,null);
 db.exec("UPDATE production_gallery SET deleted_at='gone' WHERE id='original';INSERT INTO production_card_overrides(card_source_id,deleted_at) VALUES('source','gone');");
 assert.equal(await(await file(detail.media[0].id)).text(),'test');
 assert.equal((await call({action:'addToCard',personIds:[first.id],cardId:'card'})).status,404);
 await call({action:'delete',id:first.id});assert.equal((await file(detail.media[0].id)).status,404);assert.equal(db.prepare('SELECT deleted_at FROM production_gallery WHERE id=?').get(copy.id).deleted_at,null);
 }finally{db.close();}
});
test('attach to existing person, isolate media actions, private upload and range playback',async()=>{
 const {db,env,call,file}=fixture();try{
 const {id}=await(await call({action:'create',name:'Alex'})).json();const other=await(await call({action:'create',name:'Other'})).json();
 await call({action:'fromCasting',personId:id,galleryId:'original',cardId:'card'});
 const details=await(await call(null,`?id=${id}`)).json();assert.equal(details.media.length,1);
 assert.equal((await call({action:'cover',id:other.id,mediaId:details.media[0].id})).status,404);
 assert.equal((await call({action:'removeMedia',id:other.id,mediaId:details.media[0].id})).status,404);
 const upload=(headers,body='clip')=>onRequestPost({env,request:new Request(`http://localhost/api/admin/rolodex/upload?id=${id}`,{method:'POST',headers:{cookie:'tg_admin=test','content-type':'video/mp4','x-file-size':'4','x-file-name':'Audition.mp4',...headers},body})});
 assert.equal((await upload({'content-type':'image/svg+xml'})).status,415);assert.equal((await upload({'x-file-size':'2'})).status,503);
 const m=await(await upload({})).json();assert.ok(m.id);
 const partial=await file(m.id,{cookie:'tg_admin=test',range:'bytes=1-2'});assert.equal(partial.status,206);assert.equal(await partial.text(),'li');
 await call({action:'cover',id,mediaId:m.id});assert.equal((await(await call(null,`?id=${id}`)).json()).person.coverMediaId,m.id);
 await call({action:'removeMedia',id,mediaId:m.id});assert.equal((await file(m.id)).status,404);assert.equal((await(await call(null,`?id=${id}`)).json()).person.coverMediaId,details.media[0].id);
 }finally{db.close();}
});
test('actual age uses birthday boundary, including unknown age',()=>{
 assert.equal(actualAge(null),null);assert.equal(actualAge('2000-11-19',new Date(2026,10,18)),25);assert.equal(actualAge('2000-11-19',new Date(2026,10,19)),26);
});

test('casting ages advance reported ages without restoring cleared estimates',()=>{
 const person={age:35,ageAsOfYear:2025,birthYear:null,birthday:null};
 assert.equal(castingAge(person,new Date(2026,10,19)),36);
 assert.equal(castingAge({...person,age:0,ageAsOfYear:2026},new Date(2026,10,19)),0);
 assert.equal(castingAge({...person,age:null},new Date(2026,10,19)),null);
 assert.equal(castingAge({...person,age:null},new Date(2026,10,19)),null);
});
test('age API validates values, retains reference year and leaves source text intact',async()=>{
 const {db,call}=fixture();try{
 const {id}=await(await call({action:'create',name:'Actor'})).json();
 for(const age of [-1,131,2.5,'35'])assert.equal((await call({action:'update',id,age})).status,400);
 for(const birthYear of [1899,9999,2000.5,'2000'])assert.equal((await call({action:'update',id,birthYear})).status,400);
 assert.equal((await call({action:'update',id,age:35,ageAsOfYear:2025,birthYear:null,notes:'Age:35 (as of 2025)'})).status,200);
 let p=(await(await call(null,`?id=${id}`)).json()).person;assert.equal(p.age,35);assert.equal(p.ageAsOfYear,2025);assert.equal(p.birthYear,null);
 await call({action:'update',id,phone:'123'});p=(await(await call(null,`?id=${id}`)).json()).person;assert.equal(p.ageAsOfYear,2025);
 await call({action:'update',id,age:null,birthYear:1990});p=(await(await call(null,`?id=${id}`)).json()).person;assert.equal(p.age,null);assert.equal(p.ageAsOfYear,null);assert.equal(p.birthYear,1990);assert.equal(p.notes,'Age:35 (as of 2025)');
 }finally{db.close();}
});

test('birth-year-only records become anchored age estimates without overwriting reported ages',()=>{
 const {db}=fixture();try{
 db.exec("INSERT INTO rolodex_people(id,name,birth_year,age,age_as_of_year,created_at,updated_at) VALUES('year','Year',2000,NULL,NULL,'now','now'),('reported','Reported',1990,35,2025,'now','now'),('unknown','Unknown',NULL,NULL,NULL,'now','now');");
 db.exec(ageOnlyMigration);
 const year=new Date().getUTCFullYear();
 assert.deepEqual({...db.prepare("SELECT age,age_as_of_year FROM rolodex_people WHERE id='year'").get()},{age:year-2000,age_as_of_year:year});
 assert.deepEqual({...db.prepare("SELECT age,age_as_of_year FROM rolodex_people WHERE id='reported'").get()},{age:35,age_as_of_year:2025});
 assert.equal(db.prepare("SELECT age FROM rolodex_people WHERE id='unknown'").get().age,null);
 }finally{db.close();}
});
test('new age edits automatically anchor to the current year and clearing stays unknown',async()=>{
 const {db,call}=fixture();try{
 const {id}=await(await call({action:'create',name:'Actor'})).json();
 await call({action:'update',id,age:25});
 let p=(await(await call(null,`?id=${id}`)).json()).person;
 const year=new Date().getUTCFullYear();assert.equal(p.ageAsOfYear,year);
 assert.equal(castingAge(p,new Date(year+1,6,1)),26);
 await call({action:'update',id,age:null});p=(await(await call(null,`?id=${id}`)).json()).person;
 assert.equal(castingAge(p),null);assert.equal(p.ageAsOfYear,null);
 }finally{db.close();}
});

test('gender selector values are canonical, defaults are N/A and invalid writes are rejected',async()=>{
 const {db,call}=fixture();try{
 const {id}=await(await call({action:'create',name:'Actor'})).json();
 assert.equal((await(await call(null,`?id=${id}`)).json()).person.gender,'N/A');
 for(const gender of ['Male','Female','N/A']){
  assert.equal((await call({action:'update',id,gender})).status,200);
  assert.equal((await(await call(null,`?id=${id}`)).json()).person.gender,gender);
 }
 assert.equal((await call({action:'update',id,gender:'unknown value'})).status,400);
 assert.equal((await call({action:'update',id,gender:null})).status,400);
 }finally{db.close();}
});
test('legacy genders normalize without discarding ambiguous source wording',async()=>{
 const {db,call}=fixture();try{
 const values=[['Boy','Male'],['Girl','Female'],['female','Female'],['male','Male'],['','N/A'],['Male?','N/A'],['Santa','N/A']];
 const ids=[];
 for(const [gender] of values){const {id}=await(await call({action:'create',name:'Actor'})).json();ids.push(id);db.prepare("UPDATE rolodex_people SET gender=?,notes='Original slide text' WHERE id=?").run(gender,id);}
 db.exec(await readFile('migrations/0044_rolodex_gender.sql','utf8'));
 for(let i=0;i<values.length;i++){const row=db.prepare('SELECT gender,notes FROM rolodex_people WHERE id=?').get(ids[i]);assert.equal(row.gender,values[i][1]);assert.ok(row.notes.startsWith('Original slide text'));if(['Male?','Santa'].includes(values[i][0]))assert.ok(row.notes.includes(`Original gender entry: ${values[i][0]}`));}
 }finally{db.close();}
});

test('race / ethnicity supports multiple standard categories plus Ambiguous and clears explicitly',async()=>{
 const {db,call}=fixture();try{
 const {id}=await(await call({action:'create',name:'Actor'})).json();
 assert.deepEqual((await(await call(null,`?id=${id}`)).json()).person.ethnicities,[]);
 assert.equal((await call({action:'update',id,ethnicities:['White','Asian','Ambiguous','Asian']})).status,200);
 let p=(await(await call(null,`?id=${id}`)).json()).person;
 assert.deepEqual(p.ethnicities,['Asian','White','Ambiguous']);
 assert.equal(db.prepare('SELECT ethnicity FROM rolodex_people WHERE id=?').get(id).ethnicity,'Asian; White; Ambiguous');
 for(const ethnicities of [['Unknown value'],'Asian',[null]])assert.equal((await call({action:'update',id,ethnicities})).status,400);
 await call({action:'update',id,ethnicities:[]});p=(await(await call(null,`?id=${id}`)).json()).person;assert.deepEqual(p.ethnicities,[]);assert.equal(p.ethnicity,'');
 }finally{db.close();}
});
test('race / ethnicity migration retains specific source text and maps explicit Ambiguous entries',async()=>{
 const {db,call}=fixture();try{
 const values=[['Caucasian','White'],['Asian/Vietnamese','Asian'],['African American/Ambiguous','Black or African American; Ambiguous'],['Ambiguous','Ambiguous'],['Santa',''],['','']];const ids=[];
 for(const [value] of values){const {id}=await(await call({action:'create',name:'Actor'})).json();ids.push(id);db.prepare("UPDATE rolodex_people SET ethnicity=?,notes='Slide notes' WHERE id=?").run(value,id);}
 db.exec(await readFile('migrations/0045_rolodex_ethnicity.sql','utf8'));
 for(let i=0;i<values.length;i++){const row=db.prepare('SELECT ethnicity,notes FROM rolodex_people WHERE id=?').get(ids[i]);assert.equal(row.ethnicity,values[i][1]);assert.ok(row.notes.startsWith('Slide notes'));if(values[i][0]&&values[i][0]!==values[i][1])assert.ok(row.notes.includes(values[i][0]));}
 }finally{db.close();}
});

test('upload returns before preview processing and retries reuse the same saved media',async()=>{
 const {db,env,call,objects}=fixture();try{
 const {id}=await(await call({action:'create',name:'Upload actor'})).json();
 const uploadId=crypto.randomUUID();const tasks=[];
 env.MEDIA_OPTIMIZER={fetch:async()=>new Promise(()=>{})};
 const send=()=>onRequestPost({env,waitUntil:promise=>tasks.push(promise),request:new Request(`http://localhost/api/admin/rolodex/upload?id=${id}`,{method:'POST',headers:{cookie:'tg_admin=test','content-type':'video/mp4','x-file-size':'4','x-file-name':'Audition.mp4','x-upload-id':uploadId},body:'clip'})});
 const first=await send();assert.equal(first.status,201);assert.equal((await first.json()).id,uploadId);assert.equal(tasks.length,1);
 const retry=await send();assert.equal(retry.status,200);assert.equal((await retry.json()).id,uploadId);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM rolodex_media WHERE person_id=?').get(id).n,1);
 assert.equal(objects.get(`rolodex/${id}/${uploadId}`).length,4);
 }finally{db.close();}
});
test('storage failure has a readable error and never creates a media record',async()=>{
 const {db,env,call}=fixture();try{
 const {id}=await(await call({action:'create',name:'Upload actor'})).json();
 env.PRODUCTION_ARCHIVE.put=async(key,stream)=>{await new Response(stream).arrayBuffer();throw new Error('Storage unavailable');};
 const response=await onRequestPost({env,request:new Request(`http://localhost/api/admin/rolodex/upload?id=${id}`,{method:'POST',headers:{cookie:'tg_admin=test','content-type':'video/mp4','x-file-size':'4'},body:'clip'})});
 assert.equal(response.status,503);assert.match((await response.json()).error,/could not be stored completely/);assert.equal(db.prepare('SELECT COUNT(*) n FROM rolodex_media').get().n,0);
 }finally{db.close();}
});
