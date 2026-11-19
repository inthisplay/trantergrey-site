import assert from 'node:assert/strict';import {test,after} from 'node:test';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {build} from 'esbuild';
const dir=await mkdtemp(join(tmpdir(),'tg-upload-client-'));await build({entryPoints:['lib/rolodex-upload.ts'],outfile:join(dir,'upload.mjs'),platform:'node',bundle:true,format:'esm'});const {uploadRolodexFile,uploadValidation,uploadContentType}=await import(pathToFileURL(join(dir,'upload.mjs')));after(()=>rm(dir,{recursive:true,force:true}));
let last;globalThis.XMLHttpRequest=class {upload={};headers={};constructor(){last=this;}open(method,url){this.url=url;}setRequestHeader(k,v){this.headers[k]=v;}send(file){this.file=file;}abort(){this.onabort?.();}};
const file=new File(['clip'],'Audition.mov',{type:'video/quicktime'});
test('validates size/type before sending and recognizes empty MIME by filename',()=>{assert.match(uploadValidation({size:91*1024*1024,name:'large.mov',type:'video/quicktime'}),/90 MB/);assert.match(uploadValidation({size:0,name:'empty.mp4',type:'video/mp4'}),/empty/);assert.match(uploadValidation({size:4,name:'file.exe',type:'application/octet-stream'}),/Choose/);assert.equal(uploadContentType({name:'AUDITION.MOV',type:''}),'video/quicktime');});
test('progress distinguishes transfer from saving; success requires a confirmed media id',async()=>{const stages=[];const promise=uploadRolodexFile('actor',file,'upload-id',x=>stages.push(x));last.upload.onprogress({loaded:2});last.upload.onload();assert.equal(stages[1].loaded,2);assert.equal(stages.at(-1).phase,'saving');assert.equal(last.headers['X-Upload-Id'],'upload-id');last.status=201;last.responseText=JSON.stringify({id:'saved'});last.onload();assert.deepEqual(await promise,{id:'saved'});});
test('auth errors, HTML errors, connection failures, timeouts and cancel all terminate clearly',async()=>{
 for(const scenario of ['auth','html','network','timeout','cancel']){const controller=new AbortController();const promise=uploadRolodexFile('actor',file,'upload-id',()=>{},controller.signal);const rejected=assert.rejects(promise,scenario==='auth'?/sign-in expired/:scenario==='html'?/HTTP 502/:scenario==='network'?/Connection lost/:scenario==='timeout'?/10 minutes/:/canceled/);
 if(scenario==='auth'||scenario==='html'){last.status=scenario==='auth'?401:502;last.responseText='<html>error</html>';last.onload();}else if(scenario==='network')last.onerror();else if(scenario==='timeout')last.ontimeout();else controller.abort();await rejected;}
});

test('a 300 MB audition is rejected before any network transfer',async()=>{const previous=last;await assert.rejects(uploadRolodexFile('actor',{name:'Audition.mov',type:'video/quicktime',size:310*1024*1024},'id',()=>{}),/310.0 MB.*90 MB/);assert.equal(last,previous);});
test('stalled transfers and missing save confirmations stop at their deadlines',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let promise=uploadRolodexFile('actor',file,'id',()=>{});let rejection=assert.rejects(promise,/No upload progress for 60 seconds/);t.mock.timers.tick(60001);await rejection;
 promise=uploadRolodexFile('actor',file,'id',()=>{});rejection=assert.rejects(promise,/server has not confirmed/);last.upload.onload();t.mock.timers.tick(90001);await rejection;
});
