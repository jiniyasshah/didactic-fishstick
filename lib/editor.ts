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
};
export type Project = {
    version: 1;
    name: string;
    background: string;
    duration: number;
    captions: Caption[];
};
export const baseStyle: WordStyle = { bold: false, italic: false, size: 90, color: '#ffffff' };
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const uid = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
export function tokenize(text: string, old: Word[] = []): Word[] { return (text.match(/\n|[^\S\n]+|[^\s]+/g) ?? []).map((text, i) => ({ ...baseStyle, ...old[i], text })); }
export function caption(text: string, start = 0, end = 4): Caption { return { id: uid(), start, end, words: tokenize(text), font: 'Gill Sans MT', x: 10, y: 43, width: 80, scale: 1, align: 'left', lineHeight: 1.2, spacing: 0 }; }
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
export function fontString(c: Caption, w: Word) { return `${w.italic ? 'italic' : 'normal'} ${w.bold ? 700 : 400} ${w.size * c.scale}px "${c.font.replace(/["\\]/g, '')}", "Gill Sans", "Trebuchet MS", sans-serif`; }
export function layoutCaption(ctx: Ctx, c: Caption) {
    const max = c.width / 100 * 1920;
    const lines: {
        items: {
            word: Word;
            index: number;
            width: number;
        }[];
        width: number;
        size: number;
    }[] = [];
    let line = { items: [] as {
            word: Word;
            index: number;
            width: number;
        }[], width: 0, size: 0 };
    const push = () => { while (line.items.length && /^ +$/.test(line.items.at(-1)!.word.text)) {
        line.width -= line.items.pop()!.width;
    } lines.push({ ...line, size: line.size || 90 * c.scale }); line = { items: [], width: 0, size: 0 }; };
    c.words.forEach((word, index) => { if (word.text === '\n') {
        push();
        return;
    } ctx.font = fontString(c, word); ctx.letterSpacing = `${c.spacing}px`; const width = ctx.measureText(word.text).width; if (line.width + width > max && line.items.length)
        push(); if (!line.items.length && /^ +$/.test(word.text))
        return; line.items.push({ word, index, width }); line.width += width; line.size = Math.max(line.size, word.size * c.scale); });
    push();
    return { lines, height: lines.reduce((h, l) => h + l.size * c.lineHeight, 0), width: max };
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
        let y = c.y / 100 * 1080;
        const x = c.x / 100 * 1920;
        boxes.push({ id: c.id, x, y, width: layout.width, height: layout.height });
        for (const line of layout.lines) {
            let pen = x + (c.align === 'center' ? (layout.width - line.width) / 2 : c.align === 'right' ? layout.width - line.width : 0);
            for (const item of line.items) {
                ctx.font = fontString(c, item.word);
                ctx.fillStyle = item.word.color;
                ctx.letterSpacing = `${c.spacing}px`;
                if (c.id !== skip)
                    ctx.fillText(item.word.text, pen, y + line.size * .85);
                pen += item.width;
            }
            y += line.size * c.lineHeight;
        }
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
    for (const c of p.captions) {
        if (!c || typeof c.id !== 'string' || ids.has(c.id) || !Number.isFinite(c.start) || !Number.isFinite(c.end) || c.start < 0 || c.end <= c.start || typeof c.font !== 'string' || c.font.length > 100 || !['left', 'center', 'right'].includes(c.align) || !Array.isArray(c.words) || c.words.length > 10000)
            throw new Error('The project contains invalid captions.');
        ids.add(c.id);
        for (const [k, min, max] of [['x', 0, 100], ['y', 0, 100], ['width', 5, 100], ['scale', .1, 5], ['lineHeight', .7, 3], ['spacing', -10, 30]] as const) {
            if (!Number.isFinite(c[k]) || c[k] < min || c[k] > max)
                throw new Error('The project contains invalid positioning.');
        }
        for (const w of c.words) {
            if (typeof w.text !== 'string' || w.text.length > 10000 || !Number.isFinite(w.size) || w.size < 8 || w.size > 400 || typeof w.bold !== 'boolean' || typeof w.italic !== 'boolean' || !/^#[\da-f]{6}$/i.test(w.color))
                throw new Error('The project contains invalid typography.');
        }
    }
    return p;
}
