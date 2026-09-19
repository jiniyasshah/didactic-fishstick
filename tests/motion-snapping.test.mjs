import test from 'node:test';
import assert from 'node:assert/strict';
import { caption, captionOrigin, tokenize } from '../lib/editor.ts';
import { snap, snapGroup, timeBoundaries } from '../lib/snapping.ts';
import { motionFrame, defaultMotion } from '../lib/motion.ts';
import { ensureFont, resolvedFont } from '../lib/fonts.ts';

test('center anchor stays centered as text bounds change', () => {
  const c = { ...caption('Short'), x: 50, y: 50, anchor: 'center' };
  for (const box of [{ width: 100, height: 50 }, { width: 1200, height: 300 }]) {
    const p = captionOrigin(c, box); assert.equal(p.x + box.width / 2, 960); assert.equal(p.y + box.height / 2, 540);
  }
});
test('snapping chooses closest point and keeps group timing differences', () => {
  assert.deepEqual(snap(1.97,[1,2,4],.05),{value:2,target:2});
  assert.deepEqual(snap(1.8,[1,2,4],.05),{value:1.8,target:null});
  const result = snapGroup(.98,[1,3,5],[2,8],.05); assert.equal(result.delta,1); assert.equal(result.target,2);
  const c = caption('Timed',1,3); c.words[0].start=1.2; c.words[0].end=2.5;
  assert.deepEqual(timeBoundaries([c]),[1,3,1.2,2.5]); assert.deepEqual(timeBoundaries([c],[c.id]),[]);
});
test('in/out animations settle, hide endpoints, and fit short captions', () => {
  for (const kind of ['fade','slide','scale','blur','pop','reveal']) {
    const motion={in:{kind,duration:.4,easing:'linear'},out:{kind,duration:.4,easing:'linear'}};
    const middle=motionFrame(motion,.5,1); assert.equal(middle.opacity,1); assert.ok(Math.abs(middle.scale-1)<1e-9); assert.equal(middle.reveal,1);
    const first=motionFrame(motion,0,1), last=motionFrame(motion,1,1);
    assert.equal(kind==='reveal'?first.reveal:first.opacity,0); assert.equal(kind==='reveal'?last.reveal:last.opacity,0);
    const short=motionFrame(motion,.1,.2); assert.equal(short.opacity,1); assert.equal(short.reveal,1);
  }
  assert.equal(motionFrame(defaultMotion,0,1).opacity,1);
  const out = { ...defaultMotion, out: { kind: 'fade', duration: 1, easing: 'ease-in' } };
  assert.equal(motionFrame(out,.5,1).opacity,.875);
});
test('unresolved and unavailable font metrics use a stable fallback', async () => {
  assert.equal(resolvedFont('Missing Font 123'),'Arial'); await ensureFont('Missing Font 123'); assert.equal(resolvedFont('Missing Font 123'),'Arial');
});
test('inserting text preserves existing word styles and timestamps', () => {
  const words=tokenize('Winter is coming'); words[4].italic=true;words[4].start=2;
  const edited=tokenize('Winter really is coming',words);
  assert.equal(edited.at(-1).italic,true);assert.equal(edited.at(-1).start,2);
  const replacement=tokenize('Winter is here',words);assert.equal(replacement.at(-1).italic,true);assert.equal(replacement.at(-1).start,undefined);
});
