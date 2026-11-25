import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
const dir=await mkdtemp(join(tmpdir(),'tg-retention-'));
const modules={};
for(const [key,file] of Object.entries({retention:'functions/_lib/resource-retention.ts',token:'functions/_lib/drive-token-cache.ts',oauth:'functions/_lib/client-drive-oauth.ts',download:'lib/watch-download.ts'})) {
 const output=join(dir,key+'.mjs');await build({entryPoints:[file],bundle:true,platform:'node',format:'esm',outfile:output});modules[key]=await import(pathToFileURL(output));
}
after(()=>rm(dir,{recursive:true,force:true}));
async function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(await readFile('migrations/0061_resource_retention.sql','utf8'));
 db.exec('CREATE TABLE client_directory(id TEXT,logo_key TEXT); CREATE TABLE client_drive_connection(id TEXT,refresh_cipher TEXT,drive_id TEXT,needs_reconnect INTEGER); CREATE TABLE oauth_records(kind TEXT,id TEXT,data TEXT,expires_at INTEGER,PRIMARY KEY(kind,id));');
 db.exec(await readFile('workers/deck-mcp/retention-schema.sql','utf8'));
 const binding={prepare(sql){let args=[];return{bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return db.prepare(sql).run(...args);},async all(){return{results:db.prepare(sql).all(...args)};}};}};
 const env={TG_DATA:binding,MCP_AUTH:binding,GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture-secret',GOOGLE_DRIVE_ENCRYPTION_KEY:'12'.repeat(32),GOOGLE_DRIVE_ID:'shared'};
 db.prepare('INSERT INTO client_drive_connection VALUES(?,?,?,0)').run('organization',await modules.oauth.encryptDriveSecret(env,'refresh'),'shared');
 return{db,env};
}
test('Drive token reuse is encrypted, coalesces refresh, and invalidates after expiry/reconnect/disconnect',async()=>{
 const{db,env}=await fixture();const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;await new Promise(r=>setTimeout(r,20));return Response.json({access_token:'private-token-'+calls,expires_in:3600});};
 try{
  assert.deepEqual(await Promise.all([modules.token.cachedDriveToken(env),modules.token.cachedDriveToken(env)]),['private-token-1','private-token-1']);assert.equal(calls,1);
  assert.equal(await modules.token.cachedDriveToken(env),'private-token-1');assert.equal(calls,1);
  assert(!db.prepare('SELECT access_cipher FROM drive_access_cache').get().access_cipher.includes('private-token'));
  db.exec('UPDATE drive_access_cache SET expires_at=0');assert.equal(await modules.token.cachedDriveToken(env),'private-token-2');
  db.prepare('UPDATE client_drive_connection SET refresh_cipher=?').run(await modules.oauth.encryptDriveSecret(env,'new-refresh'));
  assert.equal(await modules.token.cachedDriveToken(env),'private-token-3');
  db.exec('DELETE FROM client_drive_connection');await assert.rejects(()=>modules.token.cachedDriveToken(env),/reconnect/);assert.equal(calls,3);
 }finally{globalThis.fetch=original;db.close();}
});
test('Drive invalid grants require reconnect and release the refresh lease',async()=>{
 const{db,env}=await fixture();const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({error:'invalid_grant'},{status:400});
 try{await assert.rejects(()=>modules.token.cachedDriveToken(env),/authorized/);assert.equal(db.prepare('SELECT needs_reconnect FROM client_drive_connection').get().needs_reconnect,1);assert.equal(db.prepare('SELECT lease_until FROM drive_access_cache').get().lease_until,0);}finally{globalThis.fetch=original;db.close();}
});
test('Logo cleanup protects referenced/recent/foreign objects and resumes only after successful page',async()=>{
 const{db,env}=await fixture();const key=n=>'client-logos/client/'+String(n).padStart(36,'0');const old=new Date(Date.now()-8*86400000);const removed=[];
 db.prepare('INSERT INTO client_directory VALUES(?,?)').run('client',key(1));let fail=true;const cursors=[];
 env.PRODUCTION_ARCHIVE={async list(options){cursors.push(options.cursor);assert.equal(options.limit,100);return{truncated:true,cursor:'next',objects:[{key:key(1),uploaded:old},{key:key(2),uploaded:new Date()},{key:'gallery/foreign',uploaded:old},{key:key(3),uploaded:old}]};},async delete(k){if(fail)throw Error('fixture');removed.push(k);}};
 await assert.rejects(()=>modules.retention.cleanupUnusedLogos(env));assert.equal(db.prepare('SELECT * FROM maintenance_cursors').get(),undefined);
 fail=false;await modules.retention.cleanupUnusedLogos(env);assert.deepEqual(removed,[key(3)]);assert.equal(db.prepare('SELECT cursor FROM maintenance_cursors').get().cursor,'next');
 await modules.retention.cleanupUnusedLogos(env);assert.deepEqual(cursors,[undefined,undefined,'next']);db.close();
});
test('OAuth cleanup removes only old unused registrations, bounds batches, and protects every live grant type',async()=>{
 const{db,env}=await fixture();const now=Math.floor(Date.now()/1000),old=now-31*86400;
 const put=(kind,id,data,expiry=now+86400)=>db.prepare('INSERT INTO oauth_records VALUES(?,?,?,?)').run(kind,id,JSON.stringify(data),expiry);
 put('client','unused',{registeredAt:old});put('client','recent',{registeredAt:now});put('client','established',{registeredAt:old,authorizedAt:old});put('client','legacy',{});
 for(const kind of ['pending','code','session','refresh','token']){put('client',kind,{registeredAt:old});put(kind,kind+'-grant',{clientId:kind});}
 for(let i=0;i<105;i++)put('client','extra-'+i,{registeredAt:old});
 await modules.retention.cleanupUnusedOAuthClients(env);
 const clients=db.prepare("SELECT id,data FROM oauth_records WHERE kind='client'").all();assert.equal(clients.length,14);
 for(const id of ['recent','established','legacy','pending','code','session','refresh','token'])assert(clients.some(c=>c.id===id));
 assert(JSON.parse(clients.find(c=>c.id==='legacy').data).registeredAt>=now);
 await modules.retention.cleanupUnusedOAuthClients(env);assert.equal(db.prepare("SELECT count(*) n FROM oauth_records WHERE kind='client'").get().n,8);db.close();
});
test('Service worker keeps query navigations bounded, excludes private/redirected pages and preserves offline fallback',async()=>{
 const events={},store=new Map(),cache={async addAll(paths){for(const p of paths)store.set(p,new Response('shell'));},async put(k,v){store.set(k,v);},async match(k){return store.get(k)?.clone();}};let mode='ok';const removed=[];
 const context={URL,Response,caches:{async open(){return cache;},async keys(){return['tg-team-shell-v9','tg-team-shell-v10','other'];},async delete(k){removed.push(k);}},fetch:async()=>{if(mode==='offline')throw Error('offline');const r=new Response('network',{headers:{'content-type':'text/html','cache-control':mode==='private'?'private':'public'}});if(mode==='redirect')Object.defineProperty(r,'redirected',{value:true});return r;},self:{location:{origin:'https://test'},addEventListener(n,cb){events[n]=cb;},async skipWaiting(){},clients:{async claim(){}}}};
 runInNewContext(await readFile('public/sw.js','utf8'),context);
 async function event(name,request){const work=[];let result;events[name]({request,waitUntil(p){work.push(p);},respondWith(p){result=p;}});const response=await result;await Promise.all(work);return response;}
 await event('install');await event('activate');assert.deepEqual(removed,['tg-team-shell-v9']);
 const navigate=url=>event('fetch',{method:'GET',mode:'navigate',url:'https://test'+url});
 for(let i=0;i<100;i++)await navigate('/app/deck?card='+i);assert.equal(store.size,9);assert.equal(await store.get('/app/deck').clone().text(),'network');
 store.set('/app/deck',new Response('safe'));for(mode of ['private','redirect'])await navigate('/app/deck?unsafe=1');assert.equal(await store.get('/app/deck').clone().text(),'safe');
 await navigate('/app/unknown');await navigate('/api/private');assert.equal(store.size,9);
 mode='offline';assert.equal(await(await navigate('/app/deck?q=1')).text(),'safe');assert.equal(await(await navigate('/app/unknown')).text(),'shell');
});
test('Download cancellation aborts status polling without fetching video bytes',async()=>{
 const original=globalThis.fetch,controller=new AbortController();let calls=0;
 globalThis.fetch=async(url,init)=>{assert(String(url).startsWith('/api/watch/download'));calls++;assert(init.signal);if(calls===2)setTimeout(()=>controller.abort(),10);return Response.json(calls===1?{}:{status:'preparing'});};
 try{await assert.rejects(()=>modules.download.prepareDownload({assetId:'fixture'},'highest',controller.signal),e=>e.name==='AbortError');assert.equal(calls,2);}finally{globalThis.fetch=original;}
});
