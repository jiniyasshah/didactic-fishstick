import { baseStyle, caption, clamp, defaultRules, uid, type Caption, type CaptionRules, type Word, type WordStyle } from './editor.ts';

export function manualStyle(word: Word, patch: Partial<WordStyle>): Word {
  const next = { ...word, ...patch };
  if (word.auto) {
    const before = { ...word.auto.before }, applied = { ...word.auto.applied };
    for (const key of Object.keys(patch) as (keyof WordStyle)[]) { delete before[key]; delete applied[key]; }
    next.auto = Object.keys(applied).length ? { ...word.auto, before, applied } : undefined;
  }
  return next;
}

export function scaleCaption(c: Caption, factor: number): Caption {
  const min = Math.min(...c.words.map(w => w.size), c.baseSize ?? 90), max = Math.max(...c.words.map(w => w.size), c.baseSize ?? 90);
  factor = clamp(factor, 8 / min, 400 / max);
  return { ...c, baseSize: (c.baseSize ?? 90) * factor, width: clamp(c.width * factor, 5, 100), words: c.words.map(w => ({ ...w, size: w.size * factor, ...(w.auto ? { auto: { ...w.auto, before: { ...w.auto.before, ...(w.auto.before.size !== undefined ? { size: w.auto.before.size * factor } : {}) }, applied: { ...w.auto.applied, ...(w.auto.applied.size !== undefined ? { size: w.auto.applied.size * factor } : {}) } } } : {}) })) };
}

/** Only the requested properties change. Size ratios and non-base colors survive by default. */
export function styleCaption(c: Caption, patch: Partial<WordStyle>, preserve = true): Caption {
  let next = c;
  if (patch.size !== undefined && preserve) next = scaleCaption(c, patch.size / (c.baseSize ?? 90));
  next = { ...next, words: next.words.map(w => {
    const delta = { ...patch };
    if (preserve) {
      delete delta.size;
      if (delta.color && w.color !== (c.baseColor ?? '#ffffff')) delete delta.color;
    }
    return manualStyle(w, delta);
  }) };
  if (patch.size !== undefined && !preserve) next.baseSize = patch.size;
  if (patch.color !== undefined) next.baseColor = patch.color;
  return next;
}

export function groupWords(source: Word[], rules: CaptionRules = defaultRules, template?: Caption): Caption[] {
  const tokens = source.filter(w => w.text.trim()).map(w => ({ ...w }));
  if (!tokens.length) return [];
  const start = template?.start ?? tokens[0].start ?? 0, end = template?.end ?? tokens.at(-1)?.end ?? start + 4;
  const totalChars = tokens.reduce((n, w) => n + w.text.length, 0);
  let offset = 0;
  for (const word of tokens) {
    word.start ??= start + (end - start) * offset / totalChars;
    offset += word.text.length;
    word.end ??= start + (end - start) * offset / totalChars;
  }
  const groups: Word[][] = []; let group: Word[] = [];
  const flush = () => { if (group.length) groups.push(group); group = []; };
  for (const word of tokens) {
    const count = group.reduce((n, w) => n + w.text.length, 0) + group.length + word.text.length;
    if (group.length && (rules.limitBy !== 'characters' && group.length >= rules.maxWords || rules.limitBy !== 'words' && count > rules.maxChars || word.start! - group.at(-1)!.end! >= rules.pause)) flush();
    group.push(word);
    if (/[.!?…。！？]$/.test(word.text) || /[,;:，；：]$/.test(word.text) && group.length >= Math.ceil(rules.maxWords / 2)) flush();
  }
  flush();
  return groups.map((words, index) => {
    const lines = rules.mode === 'single' ? 1 : Math.min(rules.maxLines, Math.max(1, Math.ceil(words.map(w => w.text).join(' ').length / 24)));
    const target = words.map(w => w.text).join(' ').length / lines;
    let lineChars = 0, lineIndex = 1;
    const joined: Word[] = [];
    words.forEach((word, i) => {
      if (i) {
        const previous = words[i - 1];
        const breakLine = lineIndex < lines && (lineChars >= target || lineChars >= target * .6 && /[,;:!?]$/.test(previous.text) || lineChars + 1 + word.text.length > target * 1.2);
        joined.push({ ...baseStyle, text: breakLine ? '\n' : ' ' });
        if (breakLine) { lineIndex++; lineChars = 0; } else lineChars++;
      }
      joined.push(word); lineChars += word.text.length;
    });
    const c = template ? { ...template, id: index ? uid() : template.id } : caption('');
    return { ...c, start: words[0].start!, end: Math.max(words[0].start! + .02, words.at(-1)!.end!), words: joined, lineMode: rules.mode, maxLines: rules.mode === 'single' ? 1 : rules.maxLines };
  });
}

export type EmphasisOptions = { level: 'low' | 'medium' | 'high'; bold: boolean; italic: boolean; boldItalic: boolean; size: boolean };
export const defaultEmphasis: EmphasisOptions = { level: 'low', bold: true, italic: true, boldItalic: true, size: true };
const fillers = new Set('a an the of to and or but for so at by in on with from as is are was were be been being i me my you your he him his she her it its we us our they them their this that these those there here all very just do does did have has had will would can could should may might'.split(' '));
const emotion = new Set('love loved heart heartbreak broken lonely alone forever never always goodbye tears cry crying fear afraid hope dream dreams lost miss remember memories beautiful pain hurt sorry home alive breathe free freedom heaven soul fire die death stay believe strong brave together darkness light'.split(' '));
const action = new Set('run rise fight fall falling coming leave hold wait save break dance shine fly stand burn wake change survive win lose find make matter'.split(' '));
const clean = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}'’-]/gu, '');
export const emphasisCandidates = (c: Caption) => c.words.map(w => w.text.trim() && !fillers.has(clean(w.text)) ? w.text.trim() : '');

export function removeAuto(c: Caption): Caption {
  return { ...c, words: c.words.map(w => {
    if (!w.auto) return w;
    const next = { ...w }; delete next.auto;
    for (const key of Object.keys(w.auto.applied) as (keyof WordStyle)[]) {
      if (w[key] === w.auto.applied[key]) Object.assign(next, { [key]: w.auto.before[key] });
    }
    return next;
  }) };
}

/** Scores are deterministic: contextual similarity, lexical cues, pauses and measured vocal delivery. */
export function emphasize(c: Caption, options: EmphasisOptions, semantic: number[] = [], audio?: Float32Array, rate = 16000): Caption {
  c = removeAuto(c);
  const words = c.words.map((w, i) => ({ w, i })).filter(({ w }) => w.text.trim());
  const energies = words.map(({ w }) => {
    if (!audio || w.start === undefined || w.end === undefined) return 0;
    const a = Math.max(0, Math.floor(w.start * rate)), b = Math.min(audio.length, Math.ceil(w.end * rate));
    let energy = 0; for (let i = a; i < b; i += 8) energy += audio[i] ** 2;
    return Math.sqrt(energy / Math.max(1, (b - a) / 8));
  });
  const average = energies.reduce((n, e) => n + e, 0) / Math.max(1, energies.length);
  const ranked = words.map(({ w, i }, n) => {
    const text = clean(w.text), emotional = emotion.has(text), active = action.has(text);
    const stressed = average > 0 && energies[n] > average * 1.25;
    const held = w.start !== undefined && w.end !== undefined && w.end - w.start > .55;
    const beforePause = w.end !== undefined && words[n + 1]?.w.start !== undefined && words[n + 1].w.start! - w.end > .25;
    const score = fillers.has(text) ? -1 : (semantic[i] ?? 0) * 2 + (emotional ? 1.6 : active ? .8 : 0) + (stressed ? 1.2 : 0) + (held ? .5 : 0) + (beforePause ? .45 : 0) + (/!/.test(w.text) ? .7 : 0);
    return { i, score, emotional, stressed, held, reason: [emotional && 'emotional word', active && 'key action', stressed && 'vocal energy', held && 'held word', beforePause && 'pause', (semantic[i] ?? 0) > .3 && 'caption meaning'].filter(Boolean).join(', ') || 'key phrase' };
  }).filter(x => x.score > .5).sort((a, b) => b.score - a.score || a.i - b.i);
  const max = Math.min(Math.max(1, words.length - 1), Math.max(1, Math.ceil(words.length * ({ low: .12, medium: .25, high: .45 }[options.level]))));
  const variants: { bold?: boolean; italic?: boolean; large: boolean }[] = [];
  if (options.bold) variants.push({ bold: true, large: false });
  if (options.italic) variants.push({ italic: true, large: false });
  if (options.boldItalic) variants.push({ bold: true, italic: true, large: false });
  if (options.size) { variants.push(...variants.map(v => ({ ...v, large: true })), { large: true }); }
  const applied = new Map<number, Word>(), used = new Set<string>();
  for (const pick of ranked.slice(0, max)) {
    const w = c.words[pick.i];
    const choices = variants.map((variant, order) => {
      const patch: Partial<WordStyle> = { ...(variant.bold ? { bold: true } : {}), ...(variant.italic ? { italic: true } : {}), ...(variant.large ? { size: Math.min(400, w.size * ({ low: 1.12, medium: 1.2, high: 1.3 }[options.level])) } : {}) };
      const key = [patch.bold ?? w.bold, patch.italic ?? w.italic, (patch.size ?? w.size) > w.size].join(':');
      const score = (variant.italic && pick.emotional ? 3 : 0) + (variant.bold && pick.stressed ? 3 : 0) + (variant.bold && !pick.emotional ? 1.5 : 0) + (variant.large && (pick.stressed || pick.held || pick.score >= 1.5) ? 2 : 0) - (variant.bold && variant.italic && !pick.emotional ? 1 : 0) - (used.has(key) ? 10 : 0);
      return { patch, key, score, order };
    }).filter(v => (words.length > 5 || !used.has(v.key)) && Object.entries(v.patch).some(([key,value]) => w[key as keyof WordStyle] !== value)).sort((a,b) => b.score - a.score || a.order - b.order);
    const choice = choices[0]; if (!choice) continue;
    const before: Partial<WordStyle> = {};
    for (const key of Object.keys(choice.patch) as (keyof WordStyle)[]) {
      if (choice.patch[key] === w[key]) delete choice.patch[key]; else Object.assign(before, { [key]: w[key] });
    }
    used.add(choice.key);
    applied.set(pick.i, { ...w, ...choice.patch, auto: { before, applied: choice.patch, reason: pick.reason } });
  }
  return { ...c, words: c.words.map((w,i) => applied.get(i) ?? w) };
}
