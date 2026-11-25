import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
// Use an installed Playwright, or set PLAYWRIGHT_MODULE to its module path.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../', import.meta.url));
const {outputFiles}=await build({stdin:{contents:`import React from 'react'; import {createRoot} from 'react-dom/client'; import {ProductionCard} from './components/ProductionCard'; createRoot(document.getElementById('root')).render(<ProductionCard id="fixture"/>);`,resolveDir:root,loader:'tsx'},loader:{'.css':'empty','.module.css':'empty'},bundle:true,write:false,platform:'browser',jsx:'automatic',tsconfig:root+'/tsconfig.json'});
const browser=await chromium.launch({...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}),headless:true});
try {
const page=await browser.newPage(); page.on('pageerror', e=>console.log('PAGE ERROR',e.message)); page.setDefaultTimeout(10000);
const data={items:[],card:{source_id:'fixture',title:'Fixture',notes_html:'<p>Original</p>'},steps:[],comments:[],events:[],attachments:[],columns:[],clients:[],assignees:[],localComments:[],editLog:[],viewer:null};
await page.route('http://notes.test/**',async route=>{if(route.request().url().includes('/api/'))return route.fulfill({json:data});return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});});
await page.goto('http://notes.test/');await page.addScriptTag({content:outputFiles[0].text});
await page.locator('.production-notes-display p').click();
const editor=page.getByRole('textbox',{name:'Card notes',exact:true});
await editor.waitFor();assert(await editor.evaluate(el=>document.activeElement===el));
await page.keyboard.type(' abc123');assert.equal(await editor.textContent(),'Original abc123');
await page.keyboard.press('ArrowLeft');await page.keyboard.type('XY');assert.equal(await editor.textContent(),'Original abc12XY3');
await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.locator('.production-notes-display').textContent(),'Original');
await page.locator('.production-inline-notes-heading h2').click();assert.equal(await editor.textContent(),'Original');
await page.keyboard.type(' again');assert.equal(await editor.textContent(),'Original again');
console.log('PASS: notes body and heading activate editing; autofocus; forward typing; middle insertion; cancel and reopen.');
}finally{await browser.close();}
