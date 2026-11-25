import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {parseCsv} from './import-video-archive.mjs';
const dir=await mkdtemp(join(tmpdir(),'tg-archive-'));
const modules={};
for(const [key,file] of Object.entries({driver:'workers/archive-driver/index.ts',labels:'functions/_lib/archive-clients.ts',matching:'lib/video-archive.ts',core:'functions/_lib/video-archive.ts',api:'functions/api/admin/archive.ts',worker:'functions/api/internal/archive-worker.ts',oauth:'functions/_lib/client-drive-oauth.ts'})) {
 const output=join(dir,key+'.mjs');await build({entryPoints:[file],bundle:true,platform:'node',format:'esm',outfile:output});modules[key]=await import(pathToFileURL(output));
}
after(()=>rm(dir,{recursive:true,force:true}));
const {matchArchive}=modules.matching;
const video=(id='12345678',title='Spot V2',folder='Client / Campaign')=>({vimeo_id:id,title,folder,client:'Client',created_at:'2020-01-01T00:00:00Z',release_at:null,duration:30,description:'',tags:'[]'});
const file=(id='file',name='Spot V2.mp4',path='Client / Campaign')=>({id,name,path,mimeType:'video/mp4',size:'8',version:'1',videoMediaMetadata:{durationMillis:'30000'}});
test('CSV parses BOM, quoted commas, escaped quotes and multiline descriptions',()=>{
 assert.deepEqual(parseCsv('\uFEFFA,B\r\n"one, two","line1\nline2"\r\n"say ""hi""",x'),[{A:'one, two',B:'line1\nline2'},{A:'say "hi"',B:'x'}]);
 assert.throws(()=>parseCsv('A\n"broken'));
});
test('matching requires folder and title, preserves cuts, and does not guess duplicates',()=>{
 assert.equal(matchArchive([video()],[file()],[])[0].status,'available');
 assert.equal(matchArchive([video()],[file('a','Spot V3.mp4')],[])[0].status,'missing');
 assert.equal(matchArchive([video()],[file('a','Spot V2.mp4','Other')],[])[0].status,'missing');
 assert.equal(matchArchive([video()],[file('a'),file('b')],[])[0].status,'ambiguous');
 assert.equal(matchArchive([video()],[{...file(),videoMediaMetadata:{durationMillis:'90000'}}],[])[0].status,'ambiguous');
 assert.equal(matchArchive([video()],[{...file(),capabilities:{canDownload:false}}],[])[0].status,'restricted');
 assert.equal(matchArchive([video(),video('87654321')],[file()],[])[0].status,'ambiguous');
});
test('saved IDs survive rename; missing links are not silently rematched; explicit IDs and My library work',()=>{
 const links=[{vimeo_id:'12345678',file_id:'file',manual:0}];
 assert.equal(matchArchive([video()],[file('file','Renamed.mp4','Moved')],links)[0].status,'available');
 assert.equal(matchArchive([video()],[file('other')],links)[0].status,'missing');
 assert.equal(matchArchive([video()],[file('file','Renamed [12345678].mp4','Other')],[])[0].status,'available');
 assert.equal(matchArchive([video('12345678','Spot V2','')],[file('file','Spot V2.mp4','My library')],[])[0].status,'available');
});
async function fixture() {
 const db=new DatabaseSync(':memory:');
 for(const name of ['0005_mux_library.sql','0018_mux_library_snapshot.sql','0019_mux_library_browse_index.sql','0046_video_archive.sql','0047_archive_clients.sql'])db.exec(await readFile('migrations/'+name,'utf8'));
 db.exec("CREATE TABLE client_directory(name TEXT); INSERT INTO client_directory VALUES('Client'); CREATE TABLE admin_sessions(id TEXT,user_name TEXT,user_email TEXT,expires_at TEXT); INSERT INTO admin_sessions VALUES('test','Team','team@trantergrey.com','9999'); CREATE TABLE client_drive_connection(id TEXT,refresh_cipher TEXT,account_email TEXT,drive_id TEXT,updated_at TEXT,needs_reconnect INTEGER);");
 for(const name of ['0061_resource_retention.sql','0062_archive_revision.sql'])db.exec(await readFile('migrations/'+name,'utf8'));
 const env={ARCHIVE_WORKER_SECRET:'worker-secret'.repeat(4),ADMIN_PASSWORD:'fixture',MUX_TOKEN_ID:'mux',MUX_TOKEN_SECRET:'mux-secret',GOOGLE_CLIENT_ID:'google',GOOGLE_CLIENT_SECRET:'google-secret',GOOGLE_DRIVE_ENCRYPTION_KEY:'12'.repeat(32),GOOGLE_DRIVE_ID:'shared',TG_DATA:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};},async batch(statements){const results=[];db.exec('BEGIN');try{for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}}};
 const cipher=await modules.oauth.encryptDriveSecret(env,'refresh');db.prepare('INSERT INTO client_drive_connection VALUES(?,?,?,?,?,0)').run('organization',cipher,'owner@trantergrey.com','shared','now');
 const v=video();db.prepare('INSERT INTO archive_videos(vimeo_id,title,folder,client,created_at,duration,imported_at) VALUES(?,?,?,?,?,?,?)').run(v.vimeo_id,v.title,v.folder,v.client,v.created_at,v.duration,'now');
 db.prepare("INSERT INTO archive_files VALUES('scan','file',?)").run(JSON.stringify(file()));db.exec("UPDATE archive_state SET active_scan='scan',worker_seen_at='9999-01-01' WHERE id='archive'");
 const root=modules.core.archiveRoot;
 const records=new Map([['shared',{id:'shared',name:'Shared',mimeType:'application/vnd.google-apps.folder'}],[root,{id:root,name:'Vimeo Archive',parents:['shared'],mimeType:'application/vnd.google-apps.folder'}],['file',{...file(),parents:[root]}],['outside',{...file('outside'),parents:['shared']}]]);
 let creates=0,transferred=0,ready=false,lostResponse=false,scanFails=false,existing=[],cancelled=false,changeDuringRead=false,cancelFails=false;
 const original=globalThis.fetch;
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(input);
  if(url.hostname==='oauth2.googleapis.com')return Response.json({access_token:'access'});
  if(url.hostname==='www.googleapis.com') {
   assert.equal(init.headers.Authorization,'Bearer access');
   if(url.pathname.endsWith('/files')){if(scanFails)return new Response('',{status:403});return Response.json({files:[records.get('file')]});}
   const id=url.pathname.split('/').at(-1);const f=records.get(id);if(!f)return new Response('',{status:404});
   if(url.searchParams.get('alt')==='media'){if(changeDuringRead)f.headRevisionId='revision-new';const [,start,end]=init.headers.Range.match(/^bytes=(\d+)-(\d+)$/).map(Number);return new Response(new Uint8Array(end-start+1),{status:206,headers:{'Content-Range':`bytes ${start}-${end}/${f.size}`}});}
   return Response.json(f);
  }
  if(url.hostname==='api.mux.com') {
   if(url.pathname.endsWith('/assets'))return Response.json({data:existing});
   if(url.pathname.endsWith('/uploads')&&init.method==='POST'){creates++;cancelled=false;const body=JSON.parse(init.body);assert.deepEqual(body.new_asset_settings.playback_policies,['public']);assert.equal(body.new_asset_settings.meta.external_id,'12345678');return Response.json({data:{id:'upload1',url:'https://storage.googleapis.com/archive-test'}});}
   if(url.pathname.endsWith('/uploads/upload1/cancel')){assert.equal(init.method,'PUT');if(cancelFails)return Response.json({error:{message:'Cancellation unavailable'}},{status:503});cancelled=true;transferred=0;return Response.json({data:{id:'upload1',status:'cancelled'}});}
   if(url.pathname.endsWith('/uploads/upload1')){const complete=transferred===Number(records.get('file').size);return Response.json({data:{id:'upload1',status:complete?'asset_created':cancelled?'cancelled':'waiting',...(complete?{asset_id:'asset1'}:{})}});}
   if(url.pathname.endsWith('/assets/asset1'))return Response.json({data:{id:'asset1',status:ready?'ready':'preparing',meta:{external_id:'12345678'},playback_ids:[{id:'public1',policy:'public'}]}});
  }
  if(url.hostname==='storage.googleapis.com') {
   const range=init.headers['Content-Range'];
   const total=Number(records.get('file').size);
   if(range===`bytes */${total}`)return transferred===total?new Response('',{status:200}):new Response(null,{status:308,headers:transferred?{Range:`bytes=0-${transferred-1}`}:{}});
   const [,start,end,size]=range.match(/^bytes (\d+)-(\d+)\/(\d+)$/).map(Number);
   assert.equal(start,transferred,'Resume from receiver acknowledgement, not the stale database offset');assert.equal(size,total);assert.equal(init.body.byteLength,end-start+1);transferred=end+1;
   if(lostResponse)throw new TypeError('Simulated response lost after successful upload');
   return transferred===total?new Response('',{status:200}):new Response(null,{status:308,headers:{Range:`bytes=0-${transferred-1}`}});
  }
  throw new Error('Unexpected test request '+url.hostname+url.pathname);
 };
 const api=(body,auth=true,origin='https://local.test')=>modules.api.onRequest({env,request:new Request('https://local.test/api/admin/archive?unavailable=1',{method:body?'POST':'GET',headers:{...(auth?{cookie:'tg_admin=test'}:{}),Origin:origin},...(body?{body:JSON.stringify(body)}:{})})});
 return {db,env,api,records,restore(){db.close();globalThis.fetch=original;},get creates(){return creates;},get cancelled(){return cancelled;},set cancelFails(v){cancelFails=v;},set changeDuringRead(v){changeDuringRead=v;},get transferred(){return transferred;},set ready(v){ready=v;},set lostResponse(v){lostResponse=v;},set scanFails(v){scanFails=v;},set existing(v){existing=v;}};
}
test('archive endpoints require authentication and same origin, worker uses its own secret',async()=>{
 const f=await fixture();try{
  assert.equal((await f.api(null,false)).status,401);
  assert.equal((await f.api({action:'scan'},true,'https://evil.test')).status,403);
  assert.equal((await modules.worker.onRequestPost({env:f.env,request:new Request('https://local.test/worker',{method:'POST'})})).status,401);
  const body=await (await f.api()).json();assert.equal(body.rows[0].title,'Spot V2');assert.ok(!JSON.stringify(body).includes('upload_cipher'));
  await assert.rejects(()=>modules.core.linkArchiveFile(f.env,'12345678','outside'),/inside/);
 }finally{f.restore();}
});
test('failed Drive scan preserves the previous completed snapshot and can resume',async()=>{
 const f=await fixture();try{
  await modules.core.startArchiveScan(f.env);f.scanFails=true;await modules.core.archiveWorkerStep(f.env);
  let state=await modules.core.archiveState(f.env);assert.equal(state.scan_status,'error');assert.equal(state.active_scan,'scan');
  f.scanFails=false;await modules.core.startArchiveScan(f.env);await modules.core.archiveWorkerStep(f.env);await modules.core.archiveWorkerStep(f.env);
  state=await modules.core.archiveState(f.env);assert.equal(state.scan_status,'complete');assert.notEqual(state.active_scan,'scan');
 }finally{f.restore();}
});
test('duplicate requests share a job, lost responses reconcile, and ready imports stay unpublished',async()=>{
 const f=await fixture();try{
  const request={action:'import',id:'12345678',title:'Chosen title',client:'Client'};
  const a=await (await f.api(request)).json(),b=await (await f.api(request)).json();assert.equal(a.id,b.id);
  await modules.core.archiveWorkerStep(f.env);assert.equal(f.creates,1);
  let job=f.db.prepare('SELECT * FROM archive_imports').get();assert.ok(job.upload_cipher&&!job.upload_cipher.includes('googleapis'));
  f.lostResponse=true;await modules.core.archiveWorkerStep(f.env);assert.equal(f.transferred,8);
  f.db.exec('UPDATE archive_imports SET next_attempt_at=NULL');await modules.core.archiveWorkerStep(f.env);
  job=f.db.prepare('SELECT * FROM archive_imports').get();assert.equal(job.state,'processing');assert.equal(f.creates,1);
  f.ready=true;f.db.exec('UPDATE archive_imports SET next_attempt_at=NULL');await modules.core.archiveWorkerStep(f.env);
  job=f.db.prepare('SELECT * FROM archive_imports').get();assert.equal(job.state,'ready');assert.equal(job.upload_cipher,null);
  const metadata=f.db.prepare('SELECT * FROM mux_asset_metadata').get();assert.equal(metadata.status,'unreviewed');assert.equal(metadata.title,'Chosen title');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM mux_video_projects').get().n,0);
 }finally{f.restore();}
});
test('file version changes stop transfer and existing Mux IDs do not create uploads',async()=>{
 const f=await fixture();try{
  await f.api({action:'import',id:'12345678',title:'Spot V2',client:''});
  f.records.get('file').version='2';await modules.core.archiveWorkerStep(f.env);assert.equal(f.creates,0);
  assert.match(f.db.prepare('SELECT error FROM archive_imports').get().error,/changed/);
  f.records.get('file').version='1';f.db.exec('UPDATE archive_imports SET next_attempt_at=NULL');
  f.existing=[{id:'existing1',status:'ready',meta:{external_id:'12345678'},playback_ids:[{id:'p',policy:'public'}]}];await modules.core.archiveWorkerStep(f.env);
  assert.equal(f.creates,0);assert.equal(f.db.prepare('SELECT asset_id FROM archive_imports').get().asset_id,'existing1');
 }finally{f.restore();}
});
test('partial multi-chunk upload resumes after a lost acknowledgement without repeating bytes',async()=>{
 const f=await fixture();try{
  f.records.get('file').size=String(4*1024*1024+8);
  await f.api({action:'import',id:'12345678',title:'Spot V2',client:''});await modules.core.archiveWorkerStep(f.env);
  f.lostResponse=true;await modules.core.archiveWorkerStep(f.env);assert.equal(f.transferred,4*1024*1024);
  assert.equal(f.db.prepare('SELECT bytes_done FROM archive_imports').get().bytes_done,0);
  f.lostResponse=false;f.db.exec('UPDATE archive_imports SET next_attempt_at=NULL');await modules.core.archiveWorkerStep(f.env);
  assert.equal(f.transferred,4*1024*1024+8);assert.equal(f.creates,1);
 }finally{f.restore();}
});

test('archive bulk labels, merge and undo preserve source metadata and isolate the main directory',async()=>{
 const f=await fixture();try{
  f.db.exec("INSERT INTO archive_videos(vimeo_id,title,folder,client,created_at,imported_at) VALUES('87654321','Other','Other','Second','2020','now')");
  const originalDirectory=f.db.prepare('SELECT * FROM client_directory').all();
  let response=await f.api({action:'assign-clients',ids:['12345678','87654321'],label:'Archive only'});
  assert.equal(response.status,200);const assigned=await response.json();assert.equal(assigned.count,2);
  let data=await (await f.api()).json();assert.deepEqual(data.clients,['Archive only']);assert.deepEqual(data.directoryClients,['Client']);assert.equal(data.lastEdit.id,assigned.id);
  assert.equal(f.db.prepare("SELECT client FROM archive_videos WHERE vimeo_id='12345678'").get().client,'Client');
  f.db.exec("UPDATE archive_videos SET client='Reimported' WHERE vimeo_id='12345678'");
  assert.equal((await modules.core.archiveRows(f.env)).rows.find(row=>row.id==='12345678').client,'Archive only');
  response=await f.api({action:'rename-client',source:'Archive only',label:'Merged'});const renamed=await response.json();assert.equal(renamed.count,2);
  assert.equal((await f.api({action:'undo-clients',editId:assigned.id})).status,400,'Earlier undo cannot clobber newer changes');
  assert.equal((await f.api({action:'undo-clients',editId:renamed.id})).status,200);
  assert.equal((await f.api({action:'undo-clients',editId:assigned.id})).status,200);
  data=await (await f.api()).json();assert.deepEqual(data.clients,['Reimported','Second']);
  const cleared=await (await f.api({action:'assign-clients',ids:['12345678'],label:''})).json();
  assert.equal((await modules.core.archiveRows(f.env)).rows.find(row=>row.id==='12345678').client,'');
  await assert.rejects(()=>modules.labels.undoArchiveClients(f.env,cleared.id,'someone-else'),/no longer/);
  assert.equal((await f.api({action:'undo-clients',editId:cleared.id})).status,200);
  assert.deepEqual(f.db.prepare('SELECT * FROM client_directory').all(),originalDirectory);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM mux_asset_metadata').get().n,0);
  assert.equal((await f.api({action:'import',id:'12345678',title:'Test',client:'Archive only'})).status,400);
 }finally{f.restore();}
});

test('merge into existing label is reversible and undo refuses partial conflicts',async()=>{
 const f=await fixture();try{
  f.db.exec("INSERT INTO archive_videos(vimeo_id,title,folder,client,created_at,imported_at) VALUES('87654321','Other','Other','Target','2020','now')");
  const merged=await (await f.api({action:'rename-client',source:'Client',label:'Target'})).json();
  assert.deepEqual((await (await f.api()).json()).clients,['Target']);
  await f.api({action:'undo-clients',editId:merged.id});
  const bulk=await modules.labels.editArchiveClients(f.env,['12345678','87654321'],'Both','actor');
  await modules.labels.editArchiveClients(f.env,['87654321'],'Later','other');
  await assert.rejects(()=>modules.labels.undoArchiveClients(f.env,bulk.id,'actor'),/changed/);
  assert.equal(f.db.prepare("SELECT archive_client FROM archive_videos WHERE vimeo_id='12345678'").get().archive_client,'Both');
 }finally{f.restore();}
});

test('multiple archive labels merge in one undoable edit, including an existing destination',async()=>{
 const f=await fixture();try{
  f.db.exec("INSERT INTO archive_videos(vimeo_id,title,folder,client,created_at,imported_at) VALUES('87654321','Other','Other','Old variant','2020','now'),('11223344','Third','Other','Destination','2020','now')");
  const response=await f.api({action:'rename-client',sources:['Client','Old variant','Destination'],label:'Destination'});
  assert.equal(response.status,200);const merged=await response.json();assert.equal(merged.count,2);
  assert.deepEqual((await (await f.api()).json()).clients,['Destination']);
  assert.equal((await f.api({action:'undo-clients',editId:merged.id})).status,200);
  assert.deepEqual((await (await f.api()).json()).clients,['Client','Destination','Old variant']);
  assert.deepEqual(f.db.prepare('SELECT name FROM client_directory').all().map(row=>row.name),['Client']);
  assert.equal((await f.api({action:'rename-client',sources:[],label:'No'})).status,400);
 }finally{f.restore();}
});

test('production driver stops on idle or busy, bounds work and reports failure',async()=>{
 const original=globalThis.fetch;const env={ARCHIVE_WORKER_SECRET:'test',ARCHIVE_ENDPOINT:'https://local.test/worker'};
 try{
  let calls=0;
  globalThis.fetch=async(url,init)=>{assert.equal(url,env.ARCHIVE_ENDPOINT);assert.equal(init.headers.Authorization,'Bearer test');assert.equal(init.redirect,'manual');calls++;return Response.json({worked:true});};
  await modules.driver.default.scheduled(null,env);assert.equal(calls,40);
  for(const result of [{worked:false},{busy:true}]){calls=0;globalThis.fetch=async()=>{calls++;return Response.json(result);};await modules.driver.default.scheduled(null,env);assert.equal(calls,1);}
  for(const status of [302,503]){globalThis.fetch=async()=>new Response('',{status});await assert.rejects(()=>modules.driver.default.scheduled(null,env),new RegExp(String(status)));}
 }finally{globalThis.fetch=original;}
});

test('metadata-only version changes do not interrupt a content-revision transfer',async()=>{
 const f=await fixture();try{
  Object.assign(f.records.get('file'),{size:String(4*1024*1024+8),headRevisionId:'revision-1'});
  await f.api({action:'import',id:'12345678',title:'Spot V2',client:''});
  f.records.get('file').version='2';await modules.core.archiveWorkerStep(f.env);
  await modules.core.archiveWorkerStep(f.env);
  f.records.get('file').version='3';await modules.core.archiveWorkerStep(f.env);
  assert.equal(f.transferred,4*1024*1024+8);assert.equal(f.creates,1);
 }finally{f.restore();}
});
test('same-size binary revision changes during a download stop before sending bytes',async()=>{
 const f=await fixture();try{
  f.records.get('file').headRevisionId='revision-1';
  await f.api({action:'import',id:'12345678',title:'Spot V2',client:''});
  await modules.core.archiveWorkerStep(f.env);f.changeDuringRead=true;
  await modules.core.archiveWorkerStep(f.env);
  assert.equal(f.transferred,0);assert.match(f.db.prepare('SELECT error FROM archive_imports').get().error,/changed/);
 }finally{f.restore();}
});
test('retry restarts a failed legacy partial upload without mixing old bytes or duplicating jobs',async()=>{
 const f=await fixture();try{
  f.records.get('file').size=String(4*1024*1024+8);
  await f.api({action:'import',id:'12345678',title:'Spot V2',client:''});
  await modules.core.archiveWorkerStep(f.env);await modules.core.archiveWorkerStep(f.env);
  assert.equal(f.transferred,4*1024*1024);
  Object.assign(f.records.get('file'),{version:'2',headRevisionId:'revision-1'});
  f.db.exec("UPDATE archive_imports SET state='failed'");
  assert.equal((await f.api({action:'retry',id:'12345678'})).status,200);
  let job=f.db.prepare('SELECT * FROM archive_imports').get();
  assert.equal(f.cancelled,true);assert.equal(job.bytes_done,0);assert.equal(job.upload_id,null);
  assert.equal(job.source_version,'revision:revision-1');assert.equal(job.state,'queued');
  await f.api({action:'retry',id:'12345678'});
  await modules.core.archiveWorkerStep(f.env);await modules.core.archiveWorkerStep(f.env);await modules.core.archiveWorkerStep(f.env);
  assert.equal(f.creates,2);assert.equal(f.transferred,4*1024*1024+8);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM archive_imports').get().n,1);
 }finally{f.restore();}
});
test('retry preserves an asset already created by Mux and respects worker lease',async()=>{
 const f=await fixture();try{
  await f.api({action:'import',id:'12345678',title:'Spot V2',client:''});
  await modules.core.archiveWorkerStep(f.env);await modules.core.archiveWorkerStep(f.env);
  f.db.exec("UPDATE archive_imports SET state='failed'; UPDATE archive_state SET lease_owner='other',lease_until='9999'");
  assert.equal((await f.api({action:'retry',id:'12345678'})).status,400);
  f.db.exec('UPDATE archive_state SET lease_until=NULL');
  assert.equal((await f.api({action:'retry',id:'12345678'})).status,200);
  assert.equal(f.cancelled,false);assert.equal(f.creates,1);
  assert.equal(f.db.prepare('SELECT asset_id FROM archive_imports').get().asset_id,'asset1');
 }finally{f.restore();}
});

test('failed cancellation retains the old upload and failed job for a safe retry',async()=>{
 const f=await fixture();try{
  f.records.get('file').size=String(4*1024*1024+8);
  await f.api({action:'import',id:'12345678',title:'Spot V2',client:''});
  await modules.core.archiveWorkerStep(f.env);await modules.core.archiveWorkerStep(f.env);
  f.db.exec("UPDATE archive_imports SET state='failed'");f.cancelFails=true;
  assert.equal((await f.api({action:'retry',id:'12345678'})).status,400);
  const job=f.db.prepare('SELECT * FROM archive_imports').get();
  assert.equal(job.state,'failed');assert.equal(job.upload_id,'upload1');assert.equal(job.bytes_done,4*1024*1024);
  assert.equal(f.creates,1);assert.equal(f.db.prepare('SELECT lease_owner FROM archive_state').get().lease_owner,null);
 }finally{f.restore();}
});
test('same-size source replacement between chunks stops and explicit retry starts from zero',async()=>{
 const f=await fixture();try{
  Object.assign(f.records.get('file'),{size:String(4*1024*1024+8),headRevisionId:'revision-1'});
  await f.api({action:'import',id:'12345678',title:'Spot V2',client:''});
  await modules.core.archiveWorkerStep(f.env);await modules.core.archiveWorkerStep(f.env);
  f.records.get('file').headRevisionId='revision-2';
  for(let i=0;i<3;i++){f.db.exec('UPDATE archive_imports SET next_attempt_at=NULL');await modules.core.archiveWorkerStep(f.env);}
  assert.equal(f.transferred,4*1024*1024);assert.equal(f.db.prepare('SELECT state FROM archive_imports').get().state,'failed');
  assert.equal((await f.api({action:'retry',id:'12345678'})).status,200);
  const job=f.db.prepare('SELECT * FROM archive_imports').get();
  assert.equal(job.source_version,'revision:revision-2');assert.equal(job.bytes_done,0);assert.equal(f.cancelled,true);
 }finally{f.restore();}
});
test('unchanged archive polling reads bounded jobs, while catalog and active scan changes invalidate the revision',async()=>{
 const f=await fixture();try{
  const first=await(await f.api()).json();assert(first.revision);
  const get=revision=>modules.api.onRequest({env:f.env,request:new Request(`https://local.test/api/admin/archive?revision=${revision}&pageIds=12345678`,{headers:{cookie:'tg_admin=test'}})});
  const prepare=f.env.TG_DATA.prepare;
  f.env.TG_DATA.prepare=sql=>{assert(!sql.includes('FROM archive_videos'),'unchanged polling must not read the catalog');return prepare(sql);};
  const unchanged=await(await get(first.revision)).json();assert.equal(unchanged.unchanged,true);assert.deepEqual(unchanged.jobs,[]);assert.equal(unchanged.rows,undefined);
  f.env.TG_DATA.prepare=prepare;
  f.db.prepare('INSERT INTO archive_files VALUES(?,?,?)').run('pending','file',JSON.stringify(file()));
  assert.equal((await(await get(first.revision)).json()).unchanged,true);
  f.db.exec("UPDATE archive_videos SET title='Changed'");
  const changed=await(await get(first.revision)).json();assert.notEqual(changed.revision,first.revision);assert.equal(changed.unchanged,undefined);
  f.db.exec("UPDATE archive_state SET active_scan='pending' WHERE id='archive'");
  assert.notEqual((await(await get(changed.revision)).json()).revision,changed.revision);
 }finally{f.restore();}
});
