import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const dir=await mkdtemp(join(tmpdir(),'tg-unbranded-'));
await build({entryPoints:['functions/_lib/mux-public.ts'],bundle:true,format:'esm',platform:'node',outfile:join(dir,'public.mjs'),plugins:[{name:'fixtures',setup(build){
 build.onResolve({filter:/^\.\/(mux|mux-state|client-public-logo)$/},args=>({path:args.path,namespace:'fixture'}));
 build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='./mux' ? `export const getMuxLibraryAsset=async(env,id)=>{if(!env.assets[id])throw Error('missing');return env.assets[id]};export const getMuxLibraryAssets=async env=>Object.values(env.assets);export const muxSourceThumbnailUrl=()=>'';export const muxThumbnailUrl=()=>'';` : args.path==='./mux-state' ? `export const readVideoProjectStore=async env=>env.store;export const readMuxMetadata=async env=>env.metadata;` : `export const publicProjectClient=async(env,p)=>p.client;export const clientPublicLogo=async(env,p)=>p.unbrandedPublicPage&&p.client?'logo-key':null;`,loader:'js'}));
}}]});
const {publicWatchData}=await import(pathToFileURL(join(dir,'public.mjs')));
after(()=>rm(dir,{recursive:true,force:true}));
const fixture=()=>({assets:{publicAsset:{id:'publicAsset',playbackId:'publicPlayback',playbackPolicy:'public',title:'Video',aspectRatio:'16:9'},privateAsset:{id:'privateAsset',playbackId:'signedPlayback',playbackPolicy:'signed',title:'Private'}},store:{projects:[],collections:[]},metadata:{publicAsset:{client:'Client',downloadsEnabled:false}}});
test('standalone public videos automatically support unbranded and preserve download policy',async()=>{
 const env=fixture();const data=await publicWatchData(env,'publicAsset');assert.equal(data.unbrandedPublicPage,true);assert.equal(data.variants[0].downloadsEnabled,false);assert.equal(data.clientLogoUrl,'/api/watch/publicAsset/logo');
 const privateData=await publicWatchData(env,'privateAsset');assert.equal(privateData.unbrandedPublicPage,false);assert.deepEqual(privateData.variants,[]);assert.equal(privateData.clientLogoUrl,null);
});
test('existing ratio pages get both URLs without persisted opt-in or exposing signed variants',async()=>{
 const env=fixture();env.store.projects.push({slug:'film',legacySlugs:['old-film'],title:'Film',client:'Client',unbrandedPublicPage:false,variants:[{assetId:'publicAsset',label:'Horizontal'},{assetId:'privateAsset',label:'Private'}],collectionIds:[]});
 const data=await publicWatchData(env,'film');assert.equal(data.unbrandedPublicPage,true);assert.equal(data.variants.length,1);assert.equal(data.variants[0].playbackId,'publicPlayback');assert.equal(data.clientLogoUrl,'/api/watch/film/logo');assert.deepEqual(await publicWatchData(env,'old-film'),data);assert.equal(env.store.projects[0].unbrandedPublicPage,false);
});
