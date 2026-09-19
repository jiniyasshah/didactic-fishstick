import test from 'node:test';
import assert from 'node:assert/strict';
import { caption, defaultRules, defaultMixer, plain, trackGain, validateProject } from '../lib/editor.ts';
import { emphasize, defaultEmphasis, groupWords, removeAuto } from '../lib/caption-tools.ts';
import { copyCaptionStyle, reorderCaptions, marqueeIds } from '../lib/style-transfer.ts';

test('universal style transfer preserves all target content, ids and timings', () => {
  const source=caption('Brave new world',0,4),target=caption('Keep this whole different sentence here',10,15);
  source.font='Lora Variable';source.x=40;source.y=65;source.scale=1.2;source.spacing=3;source.lineHeight=1.5;
  source.words[0].bold=true;source.words[0].size=130;source.words[2].italic=true;source.words[4].color='#ff0000';
  source.motion={in:{kind:'pop',duration:.5,easing:'ease-out'},out:{kind:'blur',duration:.2,easing:'ease-in'}};
  target.words.forEach((w,i)=>{w.start=10+i*.2;w.end=10+i*.2+.1;});
  const result=copyCaptionStyle(target,source);
  assert.equal(plain(result),plain(target));assert.equal(result.id,target.id);assert.equal(result.start,10);assert.equal(result.end,15);
  assert.deepEqual(result.words.map(w=>[w.start,w.end]),target.words.map(w=>[w.start,w.end]));
  for(const key of ['font','x','y','scale','spacing','lineHeight','align','anchor','width'])assert.equal(result[key],source[key]);
  assert.deepEqual(result.motion,source.motion);assert.notEqual(result.motion,source.motion);
  assert.deepEqual(result.words.filter(w=>w.text.trim()).map(w=>[w.bold,w.italic,w.size,w.color]),Array.from({length:6},(_,i)=>{const w=source.words.filter(w=>w.text.trim())[i%3];return[w.bold,w.italic,w.size,w.color];}));
});
test('short-caption emphasis varies actual styles and stays reversible', () => {
  const c=caption('Brave hearts love freedom forever');
  const emphasized=emphasize(c,{...defaultEmphasis,level:'high'},c.words.map(()=>.8));
  const marked=emphasized.words.filter(w=>w.auto);assert.ok(marked.length>=2);
  const signatures=marked.map(w=>[w.bold,w.italic,w.size>90].join(':'));
  assert.equal(new Set(signatures).size,signatures.length);assert.deepEqual(removeAuto(emphasized),c);
  const limited=emphasize(c,{level:'high',bold:true,italic:false,boldItalic:false,size:false},c.words.map(()=>.8));
  assert.equal(limited.words.filter(w=>w.auto).length,1);
});
test('caption setup uses the chosen word OR character limit', () => {
  const c=caption('Extraordinarily beautiful unforgettable afternoons',0,4);
  const wordLimited=groupWords(c.words,{...defaultRules,limitBy:'words',maxWords:2,maxChars:8},c);
  assert.equal(wordLimited.length,2);assert.ok(wordLimited.some(c=>plain(c).length>8));
  const chars=groupWords(c.words,{...defaultRules,limitBy:'characters',maxWords:1,maxChars:50},c);
  assert.ok(chars.some(c=>c.words.filter(w=>w.text.trim()).length>1));
});
test('marquee selects intersecting clips in either drag direction; layers preserve content', () => {
  const cs=[caption('One',0,2),caption('Two',3,5),caption('Three',6,8)];
  assert.deepEqual(marqueeIds(cs,1,4),cs.slice(0,2).map(c=>c.id));assert.deepEqual(marqueeIds(cs,4,1),marqueeIds(cs,1,4));
  assert.deepEqual(reorderCaptions(cs,[cs[0].id,cs[1].id],'forward').map(plain),['Three','One','Two']);
  assert.deepEqual(reorderCaptions(cs,[cs[1].id,cs[2].id],'back').map(plain),['Two','Three','One']);
});
test('disabled tracks are silent and their solo flags do not silence enabled tracks', () => {
  const mixer=structuredClone(defaultMixer);mixer.vocals={muted:false,solo:true,volume:1,enabled:false,name:'Lead voice'};
  assert.equal(trackGain(mixer,'vocals'),0);assert.equal(trackGain(mixer,'original'),1);
  assert.doesNotThrow(()=>validateProject({version:1,name:'Test',background:'#000000',duration:4,captions:[caption('Test')],mixer,captionRules:{...defaultRules,limitBy:'words'}}));
});
