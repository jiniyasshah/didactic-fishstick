import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caption, baseStyle, defaultRules, defaultMixer, trackGain, plain, layoutCaption } from '../lib/editor.ts';
import { groupWords, styleCaption, scaleCaption, emphasize, removeAuto, manualStyle, defaultEmphasis } from '../lib/caption-tools.ts';

test('bulk base size/color keeps relative sizes, custom colors, and italic words', () => {
  const c = caption('winter love'); c.words[0].size = 135; c.words[0].color = '#ff0000'; c.words[2].italic = true;
  const next = styleCaption(c, { size: 120, color: '#00ff00' });
  assert.equal(next.words[0].size, 180); assert.equal(next.words[2].size, 120);
  assert.equal(next.words[0].color, '#ff0000'); assert.equal(next.words[2].color, '#00ff00'); assert.equal(next.words[2].italic, true);
  const flat = styleCaption(c, { size: 100, color: '#ffffff' }, false);
  assert.equal(flat.words[0].size, 100); assert.equal(flat.words[0].color, '#ffffff');
});

test('caption reflow enforces count limits without losing timed or styled words', () => {
  const c = caption('One two three, four five six seven eight.', 0, 8);
  c.words.filter(w => w.text.trim()).forEach((w,i) => { w.start = i; w.end = i + .8; }); c.words[4].bold = true;
  const result = groupWords(c.words, { ...defaultRules, maxWords: 3, maxChars: 16, maxLines: 2 }, c);
  assert.equal(result.flatMap(c => c.words.filter(w => w.text.trim())).map(w => w.text).join(' '), plain(c));
  assert.ok(result.every(c => c.words.filter(w => w.text.trim()).length <= 3));
  assert.ok(result.every(c => plain(c).length <= 16));
  assert.equal(result.flatMap(c => c.words).find(w => w.text === 'three,').bold, true);
  assert.equal(result.at(-1).words.at(-1).end, 7.8);
});

test('auto emphasis is reversible and removing it preserves later manual styling', () => {
  const c = caption('I will love you forever'); c.words[0].italic = true;
  const result = emphasize(c, { ...defaultEmphasis, level: 'high' }, c.words.map(() => .7));
  assert.ok(result.words.some(w => w.auto));
  assert.deepEqual(removeAuto(result), c);
  const index = result.words.findIndex(w => w.auto);
  result.words[index] = manualStyle(result.words[index], { size: 155, italic: false });
  const removed = removeAuto(result);
  assert.equal(removed.words[index].size, 155); assert.equal(removed.words[index].italic, false);
  const scaled = scaleCaption(emphasize(c, defaultEmphasis, c.words.map(() => .7)), 1.4);
  assert.ok(Math.abs(removeAuto(scaled).words[0].size - 126) < 1e-8);
});

test('mixer handles combinations, multiple solos, mute and absent stems', () => {
  const m = structuredClone(defaultMixer); m.vocals.muted = false; m.vocals.volume = .4;
  assert.equal(trackGain(m,'original'),1); assert.equal(trackGain(m,'vocals'),.4);
  m.vocals.solo = true; assert.equal(trackGain(m,'original'),0);
  m.original.solo = true; assert.equal(trackGain(m,'original'),1);
  m.vocals.muted = true; assert.equal(trackGain(m,'vocals'),0);
  assert.equal(trackGain(m,'original',['original']),1);
});

test('text bounds use actual ink metrics and single-line mode ignores line breaks', () => {
  const ctx = { measureText(text) { return { width: text.length * 10, actualBoundingBoxLeft: 0, actualBoundingBoxRight: text.trim() ? text.length * 10 : 0, actualBoundingBoxAscent: 16, actualBoundingBoxDescent: 4, fontBoundingBoxAscent: 18, fontBoundingBoxDescent: 5 }; } };
  const c = caption('Hello'); const box = layoutCaption(ctx,c); assert.equal(box.width,50); assert.equal(box.height,20);
  const two = caption('Hello\nworld'); assert.equal(layoutCaption(ctx,two).lines.length,2);
  two.lineMode='single'; assert.equal(layoutCaption(ctx,two).lines.length,1);
});
