import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const dir = await mkdtemp(join(tmpdir(), 'tg-catalog-cache-'));
await build({entryPoints:['lib/catalog-cache.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'cache.mjs')});
const { createCatalogCache } = await import(pathToFileURL(join(dir,'cache.mjs')));
after(()=>rm(dir,{recursive:true,force:true}));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
test('concurrent readers share one request and reuse it until expiry',async()=>{
 let calls=0,clock=0;const response=deferred();const cache=createCatalogCache(()=>{calls++;return response.promise;},120000,()=>clock);
 const a=cache.read(),b=cache.read();assert.equal(calls,1);response.resolve(['original']);
 assert.deepEqual(await a,await b);await cache.read();assert.equal(calls,1);
 clock=120001;await cache.read();assert.equal(calls,2);
});
test('an old response arriving after an edit cannot restore or return stale data',async()=>{
 const old=deferred();let calls=0;const cache=createCatalogCache(()=>++calls===1?old.promise:Promise.resolve(['edited']));
 const before=cache.read();await cache.change(async()=>true);old.resolve(['old']);
 assert.deepEqual(await before,['edited']);assert.deepEqual(await cache.read(),['edited']);assert.equal(calls,2);
});
test('reads wait for overlapping edits and rebuild only once after all finish',async()=>{
 const first=deferred(),second=deferred();let calls=0;const cache=createCatalogCache(async()=>{calls++;return ['latest'];});
 await cache.read();const a=cache.change(()=>first.promise),b=cache.change(()=>second.promise);const reading=cache.read();
 first.resolve('first');await Promise.resolve();assert.equal(calls,1);
 second.resolve('second');assert.deepEqual(await Promise.all([a,b,reading]),['first','second',['latest']]);assert.equal(calls,2);
});
test('failed edits clear old data; refresh failure never misreports a successful save',async()=>{
 let calls=0,fail=false;const cache=createCatalogCache(async()=>{calls++;if(fail)throw new Error('offline');return calls;});
 await cache.read();await assert.rejects(cache.change(async()=>{throw new Error('save failed');}),/save failed/);
 assert.equal(await cache.read(),2);
 fail=true;assert.equal(await cache.change(async()=>'saved'),'saved');await assert.rejects(cache.read(),/offline/);
 fail=false;assert.equal(await cache.read(),5);
});
test('external invalidation discards an in-flight error and revalidates',async()=>{
 const old=deferred();let calls=0;const cache=createCatalogCache(()=>++calls===1?old.promise:Promise.resolve('fresh'));
 const reading=cache.read();cache.invalidate();old.reject(new Error('old error'));assert.equal(await reading,'fresh');assert.equal(calls,2);
});

test('Rolodex saves and uploads rebuild the shared catalog; profile details stay uncached',async()=>{
 await build({entryPoints:['lib/rolodex.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'rolodex.mjs')});
 const saved={fetch:globalThis.fetch,window:globalThis.window,BroadcastChannel:globalThis.BroadcastChannel};
 const calls=[],broadcasts=[];let generation=0;let channel;const windowTarget=new EventTarget();
 globalThis.window=windowTarget;
 globalThis.BroadcastChannel=class {constructor(){channel=this;}postMessage(value){broadcasts.push(value);}};
 globalThis.fetch=async(url,init)=>{calls.push([url,init.method||'GET']);if(init.method==='POST'){generation++;return Response.json({ok:true});}return Response.json({people:[generation]});};
 try{
  const {rolodexRequest,rolodexMutation,subscribeRolodexCatalog}=await import(pathToFileURL(join(dir,'rolodex.mjs')));
  let notifications=0;const unsubscribe=subscribeRolodexCatalog(()=>notifications++);
  await Promise.all([rolodexRequest(),rolodexRequest()]);assert.equal(calls.length,1);
  await rolodexMutation({action:'update',id:'actor',name:'Edited'});assert.equal(calls.length,3);assert.deepEqual((await rolodexRequest()).people,[1]);assert.equal(calls.length,3);
  await rolodexRequest('/upload?id=actor',{method:'POST',body:'image'});assert.equal(calls.length,5);assert.deepEqual((await rolodexRequest()).people,[2]);
  await rolodexRequest('?id=actor');await rolodexRequest('?id=actor');assert.equal(calls.length,7);
  assert.equal(broadcasts.length,2);assert.equal(notifications,2);
  channel.onmessage();await rolodexRequest();assert.equal(calls.length,8);
  windowTarget.dispatchEvent(new Event('focus'));await rolodexRequest();assert.equal(calls.length,9);
  unsubscribe();
 }finally{Object.assign(globalThis,saved);}
});
