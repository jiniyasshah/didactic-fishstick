import { resolvedFont } from './fonts.ts';
import { motionFrame, type CaptionMotion } from './motion.ts';
export type WordStyle = {
    bold: boolean;
    italic: boolean;
    size: number;
    color: string;
};
export type Word = WordStyle & {
    text: string;
    start?: number;
    end?: number;
    auto?: { before: Partial<WordStyle>; applied: Partial<WordStyle>; reason: string };
};
export type Caption = {
    id: string;
    start: number;
    end: number;
    words: Word[];
    font: string;
    x: number;
    y: number;
    width: number;
    scale: number;
    align: 'left' | 'center' | 'right';
    lineHeight: number;
    spacing: number;
    review?: boolean;
    lineMode?: 'single' | 'multi';
    maxLines?: number;
    baseSize?: number;
    baseColor?: string;
    anchor?: 'top-left' | 'center';
    motion?: CaptionMotion;
};
export type Project = {
    version: 1;
    name: string;
    background: string;
    duration: number;
    captions: Caption[];
    captionRules?: CaptionRules;
    mixer?: Mixer;
};
export type CaptionRules = { mode: 'single' | 'multi'; maxWords: number; maxChars: number; maxLines: number; pause: number };
export const defaultRules: CaptionRules = { mode: 'multi', maxWords: 7, maxChars: 42, maxLines: 2, pause: .7 };
export type TrackName = 'original' | 'vocals' | 'instrumental';
export type Mixer = Record<TrackName, { muted: boolean; solo: boolean; volume: number }>;
export const defaultMixer: Mixer = { original: { muted: false, solo: false, volume: 1 }, vocals: { muted: true, solo: false, volume: 1 }, instrumental: { muted: true, solo: false, volume: 1 } };
export function trackGain(mixer: Mixer, key: TrackName, available: TrackName[] = ['original', 'vocals', 'instrumental']) {
    const item = mixer[key], solo = available.some(k => mixer[k].solo);
    return !available.includes(key) || item.muted || (solo && !item.solo) ? 0 : item.volume;
}
export const baseStyle: WordStyle = { bold: false, italic: false, size: 90, color: '#ffffff' };
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const uid = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
export function tokenize(text: string, old: Word[] = []): Word[] {
    const parts = text.match(/\n|[^\S\n]+|[^\s]+/g) ?? [];
    let head = 0, tail = 0;
    while (head < parts.length && head < old.length && parts[head] === old[head].text) head++;
    while (tail < parts.length - head && tail < old.length - head && parts[parts.length - 1 - tail] === old[old.length - 1 - tail].text) tail++;
    return parts.map((text, i) => {
        if (i < head) return { ...old[i] };
        if (i >= parts.length - tail) return { ...old[old.length - parts.length + i] };
        const previous = old[Math.min(i, Math.max(head, old.length - tail - 1))] ?? old[head - 1] ?? baseStyle;
        return { text, bold: previous.bold, italic: previous.italic, size: previous.size, color: previous.color };
    });
}
export function caption(text: string, start = 0, end = 4): Caption { return { id: uid(), start, end, words: tokenize(text), font: 'Inter Variable', x: 50, y: 50, anchor: 'center', width: 80, scale: 1, align: 'center', lineHeight: 1.2, spacing: 0, lineMode: 'multi', maxLines: 2, baseSize: 90, baseColor: '#ffffff' }; }
export function initialProject(): Project { const a = caption('Winter is coming', 0, 4), b = caption('Here we all are,', 4, 8), c = caption('Make every word matter.', 8, 12); a.id = 'sample-winter'; b.id = 'sample-here'; c.id = 'sample-matter'; a.words[0] = { ...a.words[0], bold: true, size: 112 }; a.words[4] = { ...a.words[4], bold: true, italic: true }; b.words = b.words.map((w, i) => ({ ...w, bold: i >= 2, italic: i === 6 })); c.words[4] = { ...c.words[4], italic: true }; return { version: 1, name: 'Untitled sequence', background: '#000000', duration: 12, captions: [a, b, c] }; }
export const plain = (c: Caption) => c.words.map(w => w.text).join('');
export function time(t: number) { const n = Math.max(0, t); return `${String(Math.floor(n / 60)).padStart(2, '0')}:${(n % 60).toFixed(2).padStart(5, '0')}`; }
export type Box = {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
};
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export function fontString(c: Caption, w: Word) { return `${w.italic ? 'italic' : 'normal'} ${w.bold ? 700 : 400} ${w.size * c.scale}px "${resolvedFont(c.font).replace(/["\\]/g, '')}", Arial, sans-serif`; }
export function captionOrigin(c: Caption, layout: { width: number; height: number }) { return { x: c.x * 19.2 - (c.anchor === 'center' ? layout.width / 2 : 0), y: c.y * 10.8 - (c.anchor === 'center' ? layout.height / 2 : 0) }; }
export function layoutCaption(ctx: Ctx, c: Caption) {
    const max = c.width / 100 * 1920;
    type Item = { word: Word; index: number; width: number; x: number; y: number; left: number; right: number; ascent: number; descent: number; fontAscent: number; fontDescent: number };
    type Line = { items: Item[]; width: number; size: number; ascent: number; descent: number };
    const lines: Line[] = [];
    let line: Line = { items: [], width: 0, size: 0, ascent: 0, descent: 0 };
    const push = () => {
        while (line.items.length && /^\s+$/.test(line.items.at(-1)!.word.text)) line.width -= line.items.pop()!.width;
        if (line.items.length) lines.push(line);
        line = { items: [], width: 0, size: 0, ascent: 0, descent: 0 };
    };
    c.words.forEach((source, index) => {
        if (source.text === '\n' && c.lineMode !== 'single' && lines.length < (c.maxLines ?? 2) - 1) { push(); return; }
        const word = source.text === '\n' ? { ...source, text: ' ' } : source;
        ctx.font = fontString(c, word); ctx.textBaseline = 'alphabetic'; ctx.letterSpacing = `${c.spacing * c.scale}px`;
        const m = ctx.measureText(word.text), size = word.size * c.scale;
        if (c.lineMode !== 'single' && line.width + m.width > max && line.items.length && lines.length < (c.maxLines ?? 2) - 1) push();
        if (!line.items.length && /^\s+$/.test(word.text)) return;
        line.items.push({ word, index, width: m.width, x: line.width, y: 0, left: m.actualBoundingBoxLeft || 0, right: m.actualBoundingBoxRight || m.width, ascent: m.actualBoundingBoxAscent || 0, descent: m.actualBoundingBoxDescent || 0, fontAscent: m.fontBoundingBoxAscent || size * .9, fontDescent: m.fontBoundingBoxDescent || size * .2 });
        line.width += m.width; line.size = Math.max(line.size, size); line.ascent = Math.max(line.ascent, m.actualBoundingBoxAscent || 0); line.descent = Math.max(line.descent, m.actualBoundingBoxDescent || 0);
    });
    push();
    const advance = Math.max(0, ...lines.map(l => l.width));
    let baseline = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    lines.forEach((l, index) => {
        if (index) baseline += Math.max(lines[index - 1].size * c.lineHeight, lines[index - 1].descent + l.ascent);
        const offset = c.align === 'center' ? (advance - l.width) / 2 : c.align === 'right' ? advance - l.width : 0;
        for (const item of l.items) {
            item.x += offset; item.y = baseline;
            if (item.word.text.trim()) { minX = Math.min(minX, item.x - item.left); maxX = Math.max(maxX, item.x + item.right); minY = Math.min(minY, baseline - item.ascent); maxY = Math.max(maxY, baseline + item.descent); }
        }
    });
    if (!Number.isFinite(minX)) return { lines, width: 4, height: (c.baseSize ?? 90) * c.scale };
    for (const l of lines) for (const item of l.items) { item.x -= minX; item.y -= minY; }
    return { lines, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}
export function drawProject(ctx: Ctx, project: Project, t: number, frame?: CanvasImageSource | null, skip?: string) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.save();
    ctx.fillStyle = project.background;
    ctx.fillRect(0, 0, w, h);
    if (frame) {
        const f = frame as HTMLVideoElement;
        const fw = f.videoWidth || (frame as HTMLCanvasElement).width, fh = f.videoHeight || (frame as HTMLCanvasElement).height;
        if (fw && fh) {
            const s = Math.min(w / fw, h / fh);
            ctx.drawImage(frame, (w - fw * s) / 2, (h - fh * s) / 2, fw * s, fh * s);
        }
    }
    ctx.scale(w / 1920, h / 1080);
    ctx.textBaseline = 'alphabetic';
    const boxes: Box[] = [];
    for (const c of project.captions.filter(c => t >= c.start && t < c.end)) {
        const layout = layoutCaption(ctx, c);
        const { x, y } = captionOrigin(c, layout);
        boxes.push({ id: c.id, x, y, width: layout.width, height: layout.height });
        const motion = motionFrame(c.motion, t - c.start, c.end - c.start);
        ctx.save();
        ctx.globalAlpha = motion.opacity;
        ctx.translate(x + layout.width / 2 + motion.x, y + layout.height / 2 + motion.y);
        ctx.scale(motion.scale, motion.scale);
        ctx.translate(-layout.width / 2, -layout.height / 2);
        if (motion.blur > 0) ctx.filter = `blur(${motion.blur * w / 1920}px)`;
        if (motion.reveal < 1) { ctx.beginPath(); ctx.rect(-2, -20, (layout.width + 4) * motion.reveal, layout.height + 40); ctx.clip(); }
        for (const line of layout.lines) for (const item of line.items) {
            ctx.font = fontString(c, item.word); ctx.fillStyle = item.word.color;
            ctx.letterSpacing = `${c.spacing * c.scale}px`;
            if (c.id !== skip) ctx.fillText(item.word.text, item.x, item.y);
        }
        ctx.restore();
    }
    ctx.restore();
    return boxes;
}
export function splitCaption(c: Caption, at: number): Caption[] { if (at <= c.start + .05 || at >= c.end - .05)
    return [c]; let idx = c.words.findIndex(w => w.start !== undefined && w.start >= at); if (idx < 1) {
    const nonspace = c.words.map((w, i) => !/^\s+$/.test(w.text) ? i : -1).filter(i => i >= 0);
    idx = nonspace[clamp(Math.round(nonspace.length * (at - c.start) / (c.end - c.start)), 1, nonspace.length - 1)] ?? c.words.length;
} if (idx >= c.words.length)
    return [c]; return [{ ...c, end: at, words: c.words.slice(0, idx) }, { ...c, id: uid(), start: at, words: c.words.slice(idx) }]; }
export function shiftCaption(c: Caption, delta: number): Caption { return { ...c, start: c.start + delta, end: c.end + delta, words: c.words.map(w => ({ ...w, start: w.start === undefined ? undefined : w.start + delta, end: w.end === undefined ? undefined : w.end + delta })) }; }
export function parseSrt(s: string): Caption[] { const stamp = (s: string) => s.split(':').reduce((t, v) => t * 60 + Number(v.replace(',', '.')), 0); return s.replace(/\r/g, '').trim().split(/\n\s*\n/).flatMap(block => { const rows = block.split('\n'); const at = rows.findIndex(r => r.includes('-->')); if (at < 0)
    return []; const pair = rows[at].split('-->').map(s => s.trim().split(' ')[0]); const start = stamp(pair[0]), end = stamp(pair[1]); return Number.isFinite(start) && end > start ? [caption(rows.slice(at + 1).join('\n'), start, end)] : []; }); }
export function toSrt(captions: Caption[]) { const stamp = (t: number) => new Date(Math.max(0, t) * 1000).toISOString().slice(11, 23).replace('.', ','); return [...captions].sort((a, b) => a.start - b.start).map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${plain(c)}`).join('\n\n'); }
export function validateProject(raw: unknown): Project {
    if (!raw || typeof raw !== 'object')
        throw new Error('Invalid project file.');
    const p = raw as Project;
    if (p.version !== 1 || typeof p.name !== 'string' || !/^#[\da-f]{6}$/i.test(p.background) || !Number.isFinite(p.duration) || p.duration <= 0 || p.duration > 36000 || !Array.isArray(p.captions) || p.captions.length > 5000)
        throw new Error('This file is not a supported Verse project.');
    const ids = new Set<string>();
    if (p.mixer) for (const key of ['original', 'vocals', 'instrumental'] as const) {
        const track = p.mixer[key];
        if (!track || typeof track.muted !== 'boolean' || typeof track.solo !== 'boolean' || !Number.isFinite(track.volume) || track.volume < 0 || track.volume > 1) throw new Error('The project contains invalid mixer settings.');
    }
    if (p.captionRules) {
        const r = p.captionRules;
        if (!['single', 'multi'].includes(r.mode) || !Number.isInteger(r.maxWords) || r.maxWords < 1 || r.maxWords > 50 || !Number.isInteger(r.maxChars) || r.maxChars < 8 || r.maxChars > 250 || !Number.isInteger(r.maxLines) || r.maxLines < 1 || r.maxLines > 6 || !Number.isFinite(r.pause) || r.pause < .1 || r.pause > 3) throw new Error('The project contains invalid caption rules.');
    }
    for (const c of p.captions) {
        if (!c || typeof c.id !== 'string' || ids.has(c.id) || !Number.isFinite(c.start) || !Number.isFinite(c.end) || c.start < 0 || c.end <= c.start || typeof c.font !== 'string' || c.font.length > 100 || !['left', 'center', 'right'].includes(c.align) || !Array.isArray(c.words) || c.words.length > 10000)
            throw new Error('The project contains invalid captions.');
        ids.add(c.id);
        if (c.anchor !== undefined && !['top-left', 'center'].includes(c.anchor)) throw new Error('Invalid caption anchor.');
        if (c.motion) for (const m of [c.motion.in, c.motion.out]) {
            if (!m || !['none', 'fade', 'slide', 'scale', 'blur', 'pop', 'reveal'].includes(m.kind) || !['linear', 'ease-in', 'ease-out', 'ease-in-out'].includes(m.easing) || !Number.isFinite(m.duration) || m.duration < 0 || m.duration > 5) throw new Error('Invalid caption animation.');
        }
        if (c.lineMode !== undefined && !['single', 'multi'].includes(c.lineMode) || c.maxLines !== undefined && (!Number.isInteger(c.maxLines) || c.maxLines < 1 || c.maxLines > 6) || c.baseSize !== undefined && (!Number.isFinite(c.baseSize) || c.baseSize < 8 || c.baseSize > 400) || c.baseColor !== undefined && !/^#[\da-f]{6}$/i.test(c.baseColor)) throw new Error('The project contains invalid caption layout.');
        for (const [k, min, max] of [['x', 0, 100], ['y', 0, 100], ['width', 5, 100], ['scale', .1, 5], ['lineHeight', .7, 3], ['spacing', -10, 30]] as const) {
            if (!Number.isFinite(c[k]) || c[k] < min || c[k] > max)
                throw new Error('The project contains invalid positioning.');
        }
        for (const w of c.words) {
            if (typeof w.text !== 'string' || w.text.length > 10000 || !Number.isFinite(w.size) || w.size < 8 || w.size > 400 || typeof w.bold !== 'boolean' || typeof w.italic !== 'boolean' || !/^#[\da-f]{6}$/i.test(w.color))
                throw new Error('The project contains invalid typography.');
            if (w.start !== undefined && (!Number.isFinite(w.start) || w.start < 0) || w.end !== undefined && (!Number.isFinite(w.end) || w.end < 0)) throw new Error('The project contains invalid word timings.');
            if (w.auto) {
                if (!w.auto.before || !w.auto.applied || typeof w.auto.reason !== 'string') throw new Error('Invalid automatic emphasis.');
                for (const values of [w.auto.before, w.auto.applied]) for (const [key, value] of Object.entries(values)) {
                    if (!['bold', 'italic', 'size', 'color'].includes(key) || (key === 'bold' || key === 'italic') && typeof value !== 'boolean' || key === 'size' && (typeof value !== 'number' || !Number.isFinite(value) || value < 8 || value > 400) || key === 'color' && (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value))) throw new Error('Invalid automatic typography.');
                }
            }
        }
    }
    return p;
}
