import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const dir=await mkdtemp(join(tmpdir(),'tg-todo-parser-'));
await build({entryPoints:['lib/todo-parser.ts'],bundle:true,format:'esm',platform:'node',outfile:join(dir,'parser.mjs')});
const {parseTodo}=await import(pathToFileURL(join(dir,'parser.mjs')));
after(()=>rm(dir,{recursive:true,force:true}));
const now=new Date(2026,10,17,12);
const parse=text=>parseTodo(text,['Tyler','Whitney Civitarese'],now);
test('example separates title, explicit past date, and assignment',()=>{const p=parse('write script for new fall campaign before 9/12/26 @Tyler');assert.equal(p.title,'write script for new fall campaign');assert.equal(p.date.value,'2026-09-12');assert.equal(p.assignee,'Tyler');});
test('date introducers work with explicit dates',()=>{for(const word of ['due','due on','due by','before','by','on','deadline','deadline is','no later than','until'])assert.equal(parse('Write script '+word+' 12/20/26').date.value,'2026-12-20',word);});
test('relative dates, month names, weekdays and omitted years',()=>{for(const [input,date] of [['tomorrow','2026-11-18'],['today','2026-11-17'],['Friday','2026-11-20'],['next Tuesday','2026-11-24'],['in 3 days','2026-11-20'],['September 12, 2027','2027-09-12'],['9/12','2027-09-12'],['2026-12-02','2026-12-02']])assert.equal(parse('Write script by '+input).date.value,date,input);});
test('invalid dates and conflicting dates stay in the title',()=>{for(const text of ['Write by 2/30/26','Write by 13/12/26','Write by 2/29/26','Write by 9/12/20266','Write by Friday or by Monday','Review the report by marketing','Visit example@example.com']){const p=parse(text);assert.equal(p.title,text);assert.equal(p.date,undefined);}assert.equal(parse('Write by 2/29/28').date.value,'2028-02-29');});
test('mentions support full roster names, brackets, quotes and multiple people',()=>{for(const text of ['Write @Whitney Civitarese','Write @[Whitney Civitarese]','Write @"Whitney Civitarese"']){assert.equal(parse(text).assignee,'Whitney Civitarese');assert.equal(parse(text).title,'Write');}assert.equal(parse('Write @Tyler @Whitney Civitarese').assignee,'Tyler, Whitney Civitarese');assert.equal(parse('Write @').title,'Write @');});
test('unknown names stay literal and known names use canonical directory spelling',()=>{
  for(const text of ['Write @Nobody','Write @[New Person]','Write @"New Person"']){const p=parse(text);assert.equal(p.assignee,'');assert.equal(p.title,text);assert.equal(p.unmatched.length,1);}
  const p=parse('Write @Nobody by Friday @tyler');assert.equal(p.title,'Write @Nobody');assert.equal(p.assignee,'Tyler');assert.equal(p.date.value,'2026-11-20');
  assert.equal(parseTodo('Write @Tyler',[],now).title,'Write @Tyler');
  assert.equal(parseTodo('Write @Whitney',['Whitney Civitarese'],now).assignee,'');
});
