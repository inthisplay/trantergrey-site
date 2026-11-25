import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const{chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const{outputFiles}=await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{VideoArchive}from'./components/VideoArchive';const root=createRoot(document.getElementById('root'));window.closeArchive=()=>root.unmount();root.render(<VideoArchive onClose={()=>root.unmount()} onImported={()=>{}}/>);`,resolveDir:root,loader:'tsx'},loader:{'.css':'empty','.module.css':'empty'},bundle:true,write:false,platform:'browser',jsx:'automatic',tsconfig:root+'/tsconfig.json',logLevel:'silent'});
const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true});
try{
 const page=await browser.newPage();page.setDefaultTimeout(10000);await page.clock.install();const requests=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 let activeJobs=0;
 const catalog={revision:'1',activeJobs:0,matchingIds:[],clientCounts:{},directoryClients:[],lastEdit:null,rows:[],total:0,catalogTotal:0,available:0,nextOffset:null,clients:[],years:[],state:null};
 await page.route('http://archive.test/**',route=>{const url=new URL(route.request().url());if(url.pathname==='/api/admin/archive'){requests.push(url);return route.fulfill({json:url.searchParams.has('revision')?{unchanged:true,revision:'1',activeJobs,state:null,jobs:[]}:{...catalog,activeJobs}});}return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});});
 await page.goto('http://archive.test');await page.addScriptTag({content:outputFiles[0].text});await page.getByRole('dialog',{name:'Video archive'}).waitFor();
 await page.waitForFunction(()=>!document.body.textContent.includes('Loading archive'));
 await page.clock.fastForward(5000);assert.equal(requests.length,1);
 await page.clock.fastForward(30000);await page.waitForTimeout(20);assert.equal(requests.length,2);assert.equal(requests[1].searchParams.get('revision'),'1');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await page.clock.fastForward(90000);assert.equal(requests.length,2);
 activeJobs=1;
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
 await page.waitForTimeout(50);assert.equal(requests.length,3);
 await page.clock.fastForward(5000);await page.waitForTimeout(50);assert.equal(requests.length,4);
 await page.getByRole('textbox',{name:'Search archive'}).fill('new');await page.clock.fastForward(300);await page.waitForTimeout(50);
 assert.equal(requests.at(-1).searchParams.get('q'),'new');assert.equal(requests.at(-1).searchParams.has('revision'),false);
 await page.evaluate(()=>window.closeArchive());const count=requests.length;await page.clock.fastForward(90000);assert.equal(requests.length,count);assert.deepEqual(errors,[]);
 console.log('PASS: idle/active polling cadence, lightweight revision requests, hidden-tab pause, visible refresh, fresh filtered loads and unmount cleanup.');
}finally{await browser.close();}
