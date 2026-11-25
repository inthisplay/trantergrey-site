import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const {outputFiles}=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{CollectionDownloads}from'./components/CollectionDownloads';const root=createRoot(document.getElementById('root'));window.closeDownloads=()=>root.unmount();root.render(<React.StrictMode><CollectionDownloads items={['one','two','three','four'].map(assetId=>({assetId,label:assetId}))}/></React.StrictMode>);`,resolveDir:root,loader:'tsx'},loader:{'.css':'empty','.module.css':'empty'},bundle:true,write:false,platform:'browser',jsx:'automatic',tsconfig:root+'/tsconfig.json',logLevel:'silent'});
const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true});
try{
 const page=await browser.newPage();page.setDefaultTimeout(10000);await page.clock.install();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let fail=true;const posted=new Set();let gets=0;
 await page.route('http://downloads.test/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname==='/api/watch/download'){
   if(request.method()==='POST'){const {assetId}=request.postDataJSON();posted.add(assetId);return route.fulfill({json:{}});}
   gets++;const id=url.searchParams.get('assetId');
   if(id==='two'&&fail)return route.fulfill({status:503,json:{error:'Try again'}});
   return route.fulfill({json:id==='one'||id==='two'?{status:'ready',downloadUrl:`http://downloads.test/media/${id}.mp4`}:{status:'preparing'}});
  }
  assert(!url.pathname.startsWith('/media/'),'UI must never fetch video bytes for packaging');
  return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});
 });
 await page.goto('http://downloads.test');await page.addScriptTag({content:outputFiles[0].text});
 await page.getByRole('link',{name:'Download MP4'}).waitFor();await page.getByRole('button',{name:'Retry',exact:true}).waitFor();
 await page.waitForFunction(()=>document.body.textContent.includes('Preparing…')&&document.body.textContent.includes('Try again'));
 assert.equal(await page.getByRole('link',{name:'Download MP4'}).count(),1);
 await page.getByRole('button',{name:'Cancel preparation'}).click();
 const before=gets;await page.clock.fastForward(10000);assert.equal(gets,before);
 fail=false;await page.locator('li').filter({hasText:'two'}).getByRole('button',{name:'Retry'}).click();
 await page.waitForFunction(()=>document.querySelectorAll('a[download]').length===2);
 assert.equal(await page.locator('a[download]').first().getAttribute('href'),'http://downloads.test/media/one.mp4');
 await page.locator('li').filter({hasText:'three'}).getByRole('button',{name:'Retry'}).click();
 await page.waitForFunction(()=>document.body.textContent.includes('Preparing…'));
 await page.evaluate(()=>window.closeDownloads());const after=gets;await page.clock.fastForward(10000);assert.equal(gets,after);assert.deepEqual(errors,[]);
 console.log('PASS: Strict Mode preparation, independent errors/retry, direct links, cancellation and unmount stop polling; no video buffering.');
}finally{await browser.close();}
