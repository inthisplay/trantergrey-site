import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const temp = await mkdtemp(join(tmpdir(), 'tg-deck-drag-'));
await build({ entryPoints: ['lib/deck-drag.ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(temp, 'drag.mjs') });
const { deckCollision, deckDropPlacement } = await import(pathToFileURL(join(temp, 'drag.mjs')));
after(() => rm(temp, { recursive: true, force: true }));
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
function fixture(pointer, collapsed = false) {
  const specs = [
    ['lane', 'column', 'lane', rect(0, 0, 200, 500)],
    ['rail', 'column', 'rail', rect(210, 0, 58, 500)],
    ['a', 'card', 'lane', rect(10, 40, 180, 80)],
    ['b', 'card', 'lane', rect(10, 140, 180, 80)],
    ['c', 'card', 'lane', rect(10, 240, 180, 80)],
    // Stale hidden-card bounds must never steal a collapsed column drop.
    ['hidden', 'card', 'rail', rect(210, 40, 180, 80)],
  ];
  return { active: { id: 'a' }, pointerCoordinates: pointer, collisionRect: rect(10, 150, 180, 80), droppableRects: new Map(specs.map(([id,,,r]) => [id,r])), droppableContainers: specs.map(([id,type,columnSourceId]) => ({ id, data: { current: { type, columnSourceId, collapsed: id === 'rail' || (id === 'lane' && collapsed) } } })) };
}
test('pointer chooses the card inside the column instead of its parent', () => {
  assert.equal(deckCollision(fixture({x:100,y:170}))[0].id, 'b');
});
test('dropping on the dragged card does not move it to the bottom', () => {
  const id = deckCollision(fixture({x:100,y:70}))[0].id;
  assert.equal(id,'a'); assert.equal(deckDropPlacement(['a','b','c'],'a',id,true),null);
});
test('collapsed rail wins over nearby and stale hidden cards', () => {
  assert.equal(deckCollision(fixture({x:230,y:70}))[0].id,'rail');
  assert.equal(deckDropPlacement(['x','y'],'a','rail',false),'');
});
test('gaps resolve within the pointed column; outside the board cancels', () => {
  assert.equal(deckCollision(fixture({x:100,y:230}))[0].id,'b');
  assert.deepEqual(deckCollision(fixture({x:205,y:170})),[]);
  assert.deepEqual(deckCollision(fixture({x:800,y:170})),[]);
});
test('empty columns accept drops', () => {
  const args=fixture({x:100,y:170}); args.droppableContainers=args.droppableContainers.filter(item=>item.data.current.type==='column');
  assert.equal(deckCollision(args)[0].id,'lane');
  assert.equal(deckDropPlacement([],'a','lane',false),'');
});
test('same-column moves up, down, and to the last slot match sortable order', () => {
  assert.equal(deckDropPlacement(['a','b','c','d'],'a','b',true),'c');
  assert.equal(deckDropPlacement(['a','b','c','d'],'d','b',true),'b');
  assert.equal(deckDropPlacement(['a','b','c','d'],'a','d',true),'');
});
test('cross-column insertion preserves the chosen side of the target card', () => {
  assert.equal(deckDropPlacement(['b','c'],'a','b',false,false),'b');
  assert.equal(deckDropPlacement(['b','c'],'a','b',false,true),'c');
});
test('keyboard collision remains available without pointer coordinates', () => {
  assert.equal(deckCollision(fixture(null))[0].id,'b');
});
