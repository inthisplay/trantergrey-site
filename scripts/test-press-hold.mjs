import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const dir = await mkdtemp(join(tmpdir(), 'tg-hold-'));
await build({entryPoints:['lib/press-hold.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'hold.mjs')});
const {createPressHold} = await import(pathToFileURL(join(dir,'hold.mjs')));
after(()=>rm(dir,{recursive:true,force:true}));
test('short tap preserves preview; 500ms hold opens once and suppresses release click', t => {
 t.mock.timers.enable({apis:['setTimeout','Date']});
 const calls=[];const hold=createPressHold((...args)=>calls.push(args));
 hold.start('image',20,30,1);t.mock.timers.tick(200);hold.end(1);t.mock.timers.tick(500);assert.equal(calls.length,0);assert.equal(hold.suppresses('image'),false);
 hold.start('image',20,30,1);t.mock.timers.tick(499);assert.equal(calls.length,0);t.mock.timers.tick(1);assert.deepEqual(calls,[['image',20,30]]);
 assert.equal(hold.fire(),false);assert.equal(hold.suppresses('image'),true);assert.equal(hold.suppresses('other'),false);
 t.mock.timers.tick(2000);hold.end(1);assert.equal(hold.suppresses('image'),true);t.mock.timers.tick(801);assert.equal(hold.suppresses('image'),false);
 hold.start('image',20,30,2);assert.equal(hold.suppresses('image'),false);hold.cancel();
});
test('scroll movement, cancellation and a second pointer cannot leave a pending menu', t => {
 t.mock.timers.enable({apis:['setTimeout']});let calls=0;const hold=createPressHold(()=>calls++);
 hold.start('video',0,0,1);hold.move(11,0,1);t.mock.timers.tick(600);assert.equal(calls,0);
 hold.start('video',0,0,1);hold.cancel();t.mock.timers.tick(600);assert.equal(calls,0);
 hold.start('video',0,0,1);hold.move(3,4,1);t.mock.timers.tick(500);assert.equal(calls,1);
 hold.start('video',0,0,1);assert.equal(hold.fire(),true);t.mock.timers.tick(500);assert.equal(calls,2);
 hold.cancel();
});
