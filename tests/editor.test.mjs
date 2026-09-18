import { test } from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,splitCaption,shiftCaption,parseSrt,toSrt,validateProject,plain} from '../lib/editor.ts';

test('split captions preserve all words and meet at the cut',()=>{
 const c=initialProject().captions[0],parts=splitCaption(c,2);
 assert.equal(parts.length,2);
 assert.equal(parts[0].end,parts[1].start);
 assert.equal(parts.map(plain).join(''),plain(c));
 assert.notEqual(parts[0].id,parts[1].id);
});
test('moving a caption moves its word timestamps by the same offset',()=>{
 const c=initialProject().captions[0];c.words[0].start=.1;c.words[0].end=.8;
 const moved=shiftCaption(c,3);
 assert.equal(moved.start,3);assert.equal(moved.end,7);
 assert.equal(moved.words[0].start,3.1);assert.equal(moved.words[0].end,3.8);
 assert.equal(c.words[0].start,.1);
});
test('SRT round trip preserves caption text and timing',()=>{
 const p=initialProject(),roundtrip=parseSrt(toSrt(p.captions));
 assert.deepEqual(roundtrip.map(c=>[c.start,c.end,plain(c)]),p.captions.map(c=>[c.start,c.end,plain(c)]));
});
test('project validation rejects invalid and duplicate caption data',()=>{
 const p=initialProject();assert.equal(validateProject(p).background,'#000000');
 assert.throws(()=>validateProject({...p,duration:-1}));
 assert.throws(()=>validateProject({...p,captions:[p.captions[0],p.captions[0]]}));
 const invalid=structuredClone(p);invalid.captions[0].words[0].size=NaN;
 assert.throws(()=>validateProject(invalid));
});
