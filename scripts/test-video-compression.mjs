import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const dir=await mkdtemp(join(tmpdir(),'tg-compress-'));
await build({entryPoints:['lib/compress-video.ts','lib/video-compression-plan.ts'],outdir:dir,platform:'node',bundle:true,format:'esm',outExtension:{'.js':'.mjs'}});
const {compressVideo}=await import(pathToFileURL(join(dir,'compress-video.mjs')));
const {compressionPlan,COMPRESSION_TARGET_BYTES}=await import(pathToFileURL(join(dir,'video-compression-plan.mjs')));
after(()=>rm(dir,{recursive:true,force:true}));
let worker;
globalThis.Worker=class {constructor(){worker=this;}postMessage(data){this.data=data;}terminate(){this.terminated=true;}};
const file=new File(['sample'],'audition.mov');
test('landscape and portrait fit 720p without upscaling',()=>{
 assert.deepEqual(compressionPlan(60,1920,1080),{width:1280,height:720,bitrate:2500000});
 assert.deepEqual(compressionPlan(60,1080,1920),{width:720,height:1280,bitrate:2500000});
 assert.equal(compressionPlan(60,640,480).width,640);
});
test('duration budget reserves audio and rejects impractical or invalid media',()=>{
 const plan=compressionPlan(600,1920,1080,256000);
 assert.ok((plan.bitrate+256000)*600/8<=COMPRESSION_TARGET_BYTES);
 for(const args of [[0,1920,1080],[60,NaN,1080],[60,1920,1080,NaN],[7200,1920,1080]])assert.throws(()=>compressionPlan(...args));
});
test('progress is not success until worker confirms complete',async()=>{
 const seen=[];const promise=compressVideo(file,p=>seen.push(p));
 worker.onmessage({data:{type:'progress',progress:.5}});assert.deepEqual(seen,[.5]);assert.ok(!worker.terminated);
 worker.onmessage({data:{type:'complete',file}});assert.equal(await promise,file);assert.ok(worker.terminated);
});
test('cancel terminates encoding and preserves source',async()=>{
 const controller=new AbortController();const promise=compressVideo(file,()=>{},controller.signal);
 const rejected=assert.rejects(promise,/canceled.*original file is unchanged/);controller.abort();await rejected;assert.ok(worker.terminated);
});
test('worker errors reject without uploading a partial copy',async()=>{
 const promise=compressVideo(file,()=>{});const rejected=assert.rejects(promise,/unsupported audio/);
 worker.onmessage({data:{type:'error',message:'unsupported audio'}});await rejected;assert.ok(worker.terminated);
});
test('inactivity and total deadlines stop stuck processing',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let promise=compressVideo(file,()=>{});let rejection=assert.rejects(promise,/stopped making progress/);t.mock.timers.tick(120001);await rejection;
 promise=compressVideo(file,()=>{});rejection=assert.rejects(promise,/exceeded 20 minutes/);
 for(let i=0;i<20;i++){worker.onmessage({data:{type:'progress',progress:i/20}});t.mock.timers.tick(60000);}await rejection;assert.ok(worker.terminated);
});
