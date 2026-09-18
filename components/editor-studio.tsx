"use client";
import CanvasText from "./canvas-text";
import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Upload, Sparkles, Play, Pause, Plus, Type, Music2, AudioLines, Film, Download, Undo2, Redo2, MousePointer2, Scissors, ChevronDown, Copy, Trash2, AlignLeft, AlignCenter, AlignRight, SkipBack, SkipForward, Volume2, VolumeX, Check, Settings2, FolderOpen, Save, ClipboardPaste, Merge, RotateCcw, LoaderCircle, Maximize2, X, Grip, Info } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { baseStyle, caption, clamp, drawProject, fontString, initialProject, layoutCaption, parseSrt, plain, shiftCaption, splitCaption, time, toSrt, tokenize, uid, validateProject, type Box, type Caption, type Project, type Word, type WordStyle } from '@/lib/editor';
import { download, exportMp4, extractAudio, inspectMedia, waveform } from '@/lib/media';
function IconButton({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
}) { return <Tooltip><TooltipTrigger asChild><button aria-label={label} {...props}>{children}</button></TooltipTrigger><TooltipContent sideOffset={7}>{label}</TooltipContent></Tooltip>; }
function NumberField({ label, value, min, max, step = .1, onChange }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (v: number) => void;
}) { return <label className="inline-field"><span>{label}</span><input aria-label={label} type="number" min={min} max={max} step={step} value={Math.round(value * 100) / 100} onChange={e => { if (e.target.value !== '' && Number.isFinite(+e.target.value))
    onChange(clamp(+e.target.value, min, max)); }}/></label>; }
function Wave({ peaks, color }: {
    peaks: number[];
    color: string;
}) { return <svg className="wave" viewBox="0 0 1000 34" preserveAspectRatio="none" aria-label="Audio waveform">{peaks.map((n, i) => <line key={i} x1={i * 2} x2={i * 2} y1={17 - Math.max(1, n * 16)} y2={17 + Math.max(1, n * 16)} stroke={color} strokeWidth="1.1"/>)}</svg>; }
type Asset = {
    file: Blob;
    url: string;
    name: string;
    hasVideo: boolean;
    hasAudio: boolean;
    duration: number;
    peaks: number[];
};
type Stems = {
    vocals: Asset;
    instrumental: Asset;
};
export default function EditorStudio() {
    const [project, setProject] = useState<Project>(initialProject), [selection, setSelection] = useState<string[]>([]), [selectedWords, setSelectedWords] = useState<number[]>([]), [editing, setEditing] = useState<string | null>(null), [tab, setTab] = useState('transcript');
    const [current, setCurrent] = useState(.2), [playing, setPlaying] = useState(false), [muted, setMuted] = useState(false), [zoom, setZoom] = useState(1), [asset, setAsset] = useState<Asset | null>(null), [stems, setStems] = useState<Stems | null>(null), [track, setTrack] = useState<'original' | 'vocals' | 'instrumental'>('original');
    const [notice, setNotice] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(''), [sample, setSample] = useState(true), [saved, setSaved] = useState(false), [fontReady, setFontReady] = useState(true), [fontTick, setFontTick] = useState(0), [fontOpen, setFontOpen] = useState(false), [fontVariant, setFontVariant] = useState('regular');
    const [aiOpen, setAiOpen] = useState(false), [apiKeys, setApiKeys] = useState({ replicate: '', openai: '' }), [aiMode, setAiMode] = useState('both'), [language, setLanguage] = useState(''), [exportOpen, setExportOpen] = useState(false), [resolution, setResolution] = useState(1080), [fps, setFps] = useState(30), [filename, setFilename] = useState('untitled-sequence'), [exportAudio, setExportAudio] = useState('original'), [progress, setProgress] = useState<number | null>(null), [exportResult, setExportResult] = useState<{
        url: string;
        size: number;
    } | null>(null);
    const [, force] = useState(0);
    const undoStack = useRef<Project[]>([]), redoStack = useRef<Project[]>([]), copiedStyle = useRef<Caption | null>(null), projectRef = useRef(project), selectionRef = useRef(selection), timeRef = useRef(current), playingRef = useRef(playing), editingRef = useRef(editing), boxes = useRef<Box[]>([]), canvas = useRef<HTMLCanvasElement>(null), shell = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null), stemAudio = useRef<HTMLAudioElement>(null), mediaInput = useRef<HTMLInputElement>(null), projectInput = useRef<HTMLInputElement>(null), subtitleInput = useRef<HTMLInputElement>(null), fontInput = useRef<HTMLInputElement>(null), wordEditor = useRef<HTMLDivElement>(null), abortRef = useRef<AbortController | null>(null), jobRef = useRef(''), assetGeneration = useRef(0);
    projectRef.current = project;
    selectionRef.current = selection;
    timeRef.current = current;
    playingRef.current = playing;
    editingRef.current = editing;
    const chosen = project.captions.find(c => selection.includes(c.id));
    const active = project.captions.filter(c => current >= c.start && current < c.end);
    const styledWord = chosen?.words[selectedWords[0] ?? 0] ?? baseStyle;
    const announce = (s: string) => { setNotice(s); setError(''); };
    const fail = (e: unknown) => { setError(e instanceof Error ? e.message : String(e)); setNotice(''); };
    const checkpoint = () => { undoStack.current.push(structuredClone(projectRef.current)); if (undoStack.current.length > 60)
        undoStack.current.shift(); redoStack.current = []; setSaved(false); };
    const commit = (change: (p: Project) => Project) => { checkpoint(); setProject(p => change(p)); };
    const undo = () => { const p = undoStack.current.pop(); if (p) {
        redoStack.current.push(projectRef.current);
        setProject(p);
        setEditing(null);
        setSelectedWords([]);
        setSaved(false);
    } };
    const redo = () => { const p = redoStack.current.pop(); if (p) {
        undoStack.current.push(projectRef.current);
        setProject(p);
        setEditing(null);
        setSaved(false);
    } };
    const seek = (t: number) => { const next = clamp(t, 0, projectRef.current.duration); setCurrent(next); timeRef.current = next; if (video.current && asset)
        video.current.currentTime = Math.min(next, asset.duration); if (stemAudio.current && stems)
        stemAudio.current.currentTime = next; };
    const select = (id: string, multi = false, jump = true) => { setEditing(null); setSelectedWords([]); setSelection(s => multi ? s.includes(id) ? s.filter(x => x !== id) : [...s, id] : [id]); if (jump) {
        const c = projectRef.current.captions.find(c => c.id === id);
        if (c) {
            setPlaying(false);
            seek(c.start + .001);
        }
    } };
    const patchCaptions = (patch: Partial<Caption>) => commit(p => ({ ...p, captions: p.captions.map(c => selectionRef.current.includes(c.id) ? { ...c, ...patch } : c) }));
    const format = (patch: Partial<WordStyle>) => commit(p => ({ ...p, captions: p.captions.map(c => selection.includes(c.id) ? { ...c, words: c.words.map((w, i) => !selectedWords.length || selectedWords.includes(i) ? { ...w, ...patch } : w) } : c) }));
    const editText = (id: string, text: string, history = true) => { const fn = (p: Project) => ({ ...p, captions: p.captions.map(c => c.id === id ? { ...c, words: tokenize(text, c.words) } : c) }); if (history)
        commit(fn);
    else
        setProject(fn); };
    const add = () => { const c = caption('Your words here', Math.min(current, project.duration - .1), Math.min(current + 3, project.duration)); commit(p => ({ ...p, captions: [...p.captions, c] })); select(c.id, false, false); setEditing(c.id); setTab('transcript'); };
    const remove = () => { if (!selection.length)
        return; commit(p => ({ ...p, captions: p.captions.filter(c => !selection.includes(c.id)) })); setSelection([]); setEditing(null); setSelectedWords([]); };
    const duplicate = () => {
        const copies = projectRef.current.captions.filter(c => selection.includes(c.id)).map(c => ({ ...structuredClone(c), id: uid(), y: clamp(c.y + 8, 0, 90) }));
        commit(p => ({ ...p, captions: [...p.captions, ...copies] }));
        setSelection(copies.map(c => c.id));
        announce('Duplicated captions. Drag them to a new time or position.');
    };
    const split = () => { if (!chosen)
        return; const parts = splitCaption(chosen, current); if (parts.length === 1) {
        announce('Place the playhead inside the caption, between words.');
        return;
    } commit(p => ({ ...p, captions: p.captions.flatMap(c => c.id === chosen.id ? parts : [c]) })); setSelection(parts.map(c => c.id)); setEditing(null); };
    const merge = () => { const cs = project.captions.filter(c => selection.includes(c.id)).sort((a, b) => a.start - b.start); if (cs.length < 2)
        return; const merged = { ...cs[0], start: cs[0].start, end: Math.max(...cs.map(c => c.end)), words: cs.flatMap((c, i) => i ? [{ ...baseStyle, text: ' ' }, ...c.words] : c.words) }; commit(p => ({ ...p, captions: [...p.captions.filter(c => !selection.includes(c.id)), merged].sort((a, b) => a.start - b.start) })); setSelection([merged.id]); setSelectedWords([]); };
    const changeTiming = (id: string, key: 'start' | 'end', value: number) => commit(p => ({ ...p, captions: p.captions.map(c => c.id !== id ? c : key === 'start' ? { ...c, start: clamp(value, 0, c.end - .05) } : { ...c, end: clamp(value, c.start + .05, p.duration) }) }));
    const navigate = (dir: number) => { const cs = [...project.captions].sort((a, b) => a.start - b.start); const index = cs.findIndex(c => c.id === chosen?.id); const next = cs[clamp(index + dir, 0, cs.length - 1)]; if (next)
        select(next.id); };
    const save = () => { download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `${project.name || 'verse-project'}.verse.json`); setSaved(true); announce('Project saved. Keep your original media to relink when reopening.'); };
    useEffect(() => { setSelection([projectRef.current.captions[0]?.id].filter(Boolean)); const test = document.createElement('canvas').getContext('2d')!; test.font = '72px monospace'; const fallback = test.measureText('Winter is coming MWiw').width; test.font = '72px "Gill Sans MT", monospace'; setFontReady(Math.abs(test.measureText('Winter is coming MWiw').width - fallback) > .1); }, [fontTick]);
    useEffect(() => { if (!notice)
        return; const id = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(id); }, [notice]);
    useEffect(() => { let frame = 0, last = performance.now(), lastUpdate = 0; const tick = (now: number) => { const delta = (now - last) / 1000; last = now; if (playingRef.current) {
        const t = asset && video.current && !video.current.ended ? video.current.currentTime : timeRef.current + delta;
        timeRef.current = Math.min(t, projectRef.current.duration);
        if (t >= projectRef.current.duration) {
            setPlaying(false);
            setCurrent(projectRef.current.duration);
        }
        else if (now - lastUpdate > 30) {
            setCurrent(t);
            lastUpdate = now;
        }
    } const ctx = canvas.current?.getContext('2d'); if (ctx) {
        const image = asset?.hasVideo && video.current && video.current.readyState >= 2 ? video.current : null;
        boxes.current = drawProject(ctx, projectRef.current, timeRef.current, image, editingRef.current ?? undefined);
    } frame = requestAnimationFrame(tick); }; frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame); }, [asset]);
    useEffect(() => { const v = video.current, a = stemAudio.current; if (v) {
        v.muted = muted || track !== 'original';
        if (playing && asset)
            v.play().catch(e => { setPlaying(false); fail(e); });
        else
            v.pause();
    } if (a) {
        a.muted = muted;
        if (playing && track !== 'original' && stems) {
            a.currentTime = timeRef.current;
            a.play().catch(e => { setPlaying(false); fail(e); });
        }
        else
            a.pause();
    } }, [playing, track, muted, asset, stems]);
    useEffect(() => { const before = (e: BeforeUnloadEvent) => { if (!saved && !sample) {
        e.preventDefault();
        e.returnValue = '';
    } }; window.addEventListener('beforeunload', before); return () => window.removeEventListener('beforeunload', before); }, [saved, sample]);
    useEffect(() => { const handler = (e: KeyboardEvent) => { const element = e.target as HTMLElement; const text = element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName); if (e.key === 'Escape') {
        setEditing(null);
        setSelectedWords([]);
        return;
    } if (text)
        return; if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
    }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
    }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelection(project.captions.map(c => c.id));
    }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicate();
    }
    else if (e.code === 'Space') {
        e.preventDefault();
        if (current >= project.duration)
            seek(0);
        setPlaying(p => !p);
    }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove();
    }
    else if (e.key === 'ArrowLeft')
        seek(current - (e.shiftKey ? 1 : 1 / fps));
    else if (e.key === 'ArrowRight')
        seek(current + (e.shiftKey ? 1 : 1 / fps)); }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); });
    useEffect(() => { const context = (document as unknown as {
        modelContext?: {
            registerTool: (tool: unknown, options: unknown) => Promise<void>;
        };
    }).modelContext; if (!context?.registerTool)
        return; const life = new AbortController(); const tool = { name: 'read_caption_project', description: 'Read the current caption text, timing and canvas settings.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: async (input: unknown) => { if (!input || typeof input !== 'object' || Object.keys(input).length)
            throw new Error('Expected an empty object.'); return { name: projectRef.current.name, duration: projectRef.current.duration, background: projectRef.current.background, captions: projectRef.current.captions.map(c => ({ id: c.id, start: c.start, end: c.end, text: plain(c) })) }; } }; try {
        void Promise.resolve(context.registerTool(tool, { signal: life.signal })).catch(() => { });
    }
    catch { } return () => life.abort(); }, []);
    async function importMedia(file: File) { if (file.size > 1024 * 1024 * 1024) {
        fail('Choose a file smaller than 1 GB.');
        return;
    } setBusy('Reading media…'); setPlaying(false); setEditing(null); const generation = ++assetGeneration.current; try {
        const info = await inspectMedia(file);
        if (info.duration > 720)
            throw new Error('Choose a clip up to 12 minutes for this browser editor.');
        const next: Asset = { file, url: URL.createObjectURL(file), name: file.name, ...info, peaks: [] };
        if (asset)
            URL.revokeObjectURL(asset.url);
        if (stems) {
            URL.revokeObjectURL(stems.vocals.url);
            URL.revokeObjectURL(stems.instrumental.url);
        }
        setAsset(next);
        setStems(null);
        setTrack('original');
        commit(p => ({ ...p, name: sample ? file.name.replace(/\.[^.]+$/, '') : p.name, duration: Math.max(info.duration, sample ? 0 : Math.max(0, ...p.captions.map(c => c.end))), captions: sample ? [] : p.captions }));
        setSample(false);
        setSelection([]);
        seek(0);
        setTab('media');
        announce('Media imported. Separate vocals or start editing captions.');
        if (info.hasAudio) {
            waveform(file).then(peaks => { if (generation === assetGeneration.current)
                setAsset(a => a ? { ...a, peaks } : a); }).catch(() => announce('Media loaded. Waveform could not be decoded in this browser.'));
        }
    }
    catch (e) {
        fail(e);
    }
    finally {
        setBusy('');
    } }
    async function readProject(file: File) { try {
        const p = validateProject(JSON.parse(await file.text()));
        if (asset) URL.revokeObjectURL(asset.url);
        if (stems) { URL.revokeObjectURL(stems.vocals.url); URL.revokeObjectURL(stems.instrumental.url); }
        assetGeneration.current++;
        setAsset(null);
        setStems(null);
        setTrack('original');
        setEditing(null);
        commit(() => p);
        setSelection([]);
        setSelectedWords([]);
        setSample(false);
        setPlaying(false);
        seek(0);
        announce('Project opened. Import its original media to relink it.');
    }
    catch (e) {
        fail(e);
    } }
    async function readSubtitles(file: File) { try {
        const cs = parseSrt(await file.text());
        if (!cs.length)
            throw new Error('No timed captions found. Choose an SRT or VTT file.');
        commit(p => ({ ...p, captions: cs, duration: Math.max(p.duration, ...cs.map(c => c.end)) }));
        setSample(false);
        setTab('transcript');
        select(cs[0].id, false, false);
        seek(cs[0].start);
        announce(`Imported ${cs.length} editable captions.`);
    }
    catch (e) {
        fail(e);
    } }
    async function loadFont(file: File) { try {
        const data = await file.arrayBuffer();
        const face = new FontFace('Gill Sans MT', data, { weight: fontVariant.includes('bold') ? '700' : '400', style: fontVariant.includes('italic') ? 'italic' : 'normal' });
        await face.load();
        document.fonts.add(face);
        setFontTick(t => t + 1);
        announce(`${fontVariant} font loaded for this session.`);
    }
    catch {
        fail('This font could not be loaded. Choose a valid TTF, OTF or WOFF file.');
    } }
    function canvasDrag(e: React.PointerEvent, id: string, resize = false) { if (editing === id)
        return; e.stopPropagation(); e.preventDefault(); setPlaying(false); const multi = e.shiftKey || e.ctrlKey || e.metaKey; if (multi) {
        select(id, true, false);
        return;
    } const ids = selection.includes(id) ? selection : [id]; setSelection(ids); setSelectedWords([]); checkpoint(); const start = structuredClone(projectRef.current); const rect = shell.current!.getBoundingClientRect(), sx = e.clientX, sy = e.clientY; const move = (ev: PointerEvent) => { const dx = (ev.clientX - sx) / rect.width * 100, dy = (ev.clientY - sy) / rect.height * 100; setProject({ ...start, captions: start.captions.map(c => ids.includes(c.id) ? resize ? { ...c, scale: clamp(c.scale + dx / 30, .1, 5) } : { ...c, x: clamp(c.x + dx, 0, 100 - c.width), y: clamp(c.y + dy, 0, 95) } : c) }); }; const done = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', done); }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', done, { once: true }); }
    function timelineDrag(e: React.PointerEvent, c: Caption, edge?: 'start' | 'end') { e.stopPropagation(); if (e.button !== 0)
        return; setPlaying(false); if (e.shiftKey || e.ctrlKey || e.metaKey) {
        select(c.id, true, false);
        return;
    } const ids = selection.includes(c.id) ? selection : [c.id]; setSelection(ids); setEditing(null); setSelectedWords([]); const lane = e.currentTarget.closest('.timeline-content')!.getBoundingClientRect(); const sx = e.clientX; const start = structuredClone(projectRef.current); let moved = false; const move = (ev: PointerEvent) => { if (Math.abs(ev.clientX - sx) < 3 && !moved)
        return; if (!moved) {
        checkpoint();
        moved = true;
    } const delta = (ev.clientX - sx) / lane.width * start.duration; const moving = start.captions.filter(c => ids.includes(c.id)); const bounded = clamp(delta, -Math.min(...moving.map(c => c.start)), start.duration - Math.max(...moving.map(c => c.end))); setProject({ ...start, captions: start.captions.map(item => { if (edge && item.id === c.id)
            return { ...item, [edge]: edge === 'start' ? clamp(item.start + delta, 0, item.end - .05) : clamp(item.end + delta, item.start + .05, start.duration) }; return !edge && ids.includes(item.id) ? shiftCaption(item, bounded) : item; }) }); }; const done = () => { window.removeEventListener('pointermove', move); if (!moved)
        seek(c.start + .001); window.removeEventListener('pointerup', done); }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', done, { once: true }); }
    function captureWords() { const range = window.getSelection(); if (!range || range.isCollapsed || !wordEditor.current) {
        setSelectedWords([]);
        return;
    } const r = range.getRangeAt(0); const found = Array.from(wordEditor.current.querySelectorAll('[data-word]')).filter(n => r.intersectsNode(n)).map(n => Number(n.getAttribute('data-word'))); setSelectedWords(found); }
    function centerCaptions() { const ctx = canvas.current?.getContext('2d'); if (!ctx)
        return; commit(p => ({ ...p, captions: p.captions.map(c => selection.includes(c.id) ? { ...c, x: (100 - c.width) / 2, y: clamp((1080 - layoutCaption(ctx, c).height) / 1080 * 50, 0, 95), align: 'center' } : c) })); }
    const reset = () => commit(p => ({ ...p, captions: p.captions.map(c => selection.includes(c.id) ? { ...c, font: 'Gill Sans MT', scale: 1, spacing: 0, lineHeight: 1.2, words: c.words.map(w => ({ ...w, ...baseStyle })) } : c) }));
    async function aiRequest(path: string, options: RequestInit, signal?: AbortSignal) { const r = await fetch(path, { ...options, signal, headers: { ...options.headers, 'x-replicate-key': apiKeys.replicate, 'x-openai-key': apiKeys.openai } }); const data = await r.json() as Record<string, any>; if (!r.ok || data.error)
        throw new Error(data.error || 'AI processing failed.'); return data; }
    async function runAI() {
        if (!asset?.hasAudio) {
            fail('Upload a video or audio file with an audio track first.');
            return;
        }
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setError('');
        setPlaying(false);
        setEditing(null);
        let vocals = stems?.vocals.file;
        try {
            if (aiMode !== 'transcribe') {
                setBusy('Preparing audio for separation…');
                const original = await extractAudio(asset.file, true);
                ctrl.signal.throwIfAborted();
                const form = new FormData();
                form.append('file', original, 'original.m4a');
                setBusy('Separating vocals and instrumental…');
                let job = await aiRequest('/api/ai?action=separate', { method: 'POST', body: form }, ctrl.signal);
                jobRef.current = job.id;
                const deadline = Date.now() + 20 * 60 * 1000;
                while (job.status !== 'succeeded') {
                    if (['failed', 'canceled'].includes(job.status))
                        throw new Error(job.error || 'Vocal separation did not complete.');
                    if (Date.now() > deadline)
                        throw new Error('Separation is taking too long. Check your Replicate account for this job.');
                    await new Promise<void>((resolve, reject) => { const stop = () => { clearTimeout(timer); reject(new DOMException('Canceled', 'AbortError')); }; const timer = setTimeout(() => { ctrl.signal.removeEventListener('abort', stop); resolve(); }, 2500); ctrl.signal.addEventListener('abort', stop, { once: true }); });
                    job = await aiRequest(`/api/ai?id=${encodeURIComponent(job.id)}`, {}, ctrl.signal);
                }
                const output = job.output;
                const vocalUrl = output?.vocals, instrumentalUrl = output?.other ?? output?.no_vocals;
                if (!vocalUrl || !instrumentalUrl)
                    throw new Error('The provider did not return both stems.');
                setBusy('Loading separated stems…');
                const get = async (url: string) => { const r = await fetch(`/api/ai?audio=${encodeURIComponent(url)}`, { signal: ctrl.signal }); if (!r.ok)
                    throw new Error('Could not download a separated stem.'); return r.blob(); };
                const [v, i] = await Promise.all([get(vocalUrl), get(instrumentalUrl)]);
                const make = async (file: Blob, name: string): Promise<Asset> => ({ file, url: URL.createObjectURL(file), name, hasVideo: false, hasAudio: true, duration: asset.duration, peaks: await waveform(file) });
                const [vocalAsset, instrumentalAsset] = await Promise.all([make(v, 'Vocals.wav'), make(i, 'Instrumental.wav')]);
                ctrl.signal.throwIfAborted();
                if (stems) {
                    URL.revokeObjectURL(stems.vocals.url);
                    URL.revokeObjectURL(stems.instrumental.url);
                }
                setStems({ vocals: vocalAsset, instrumental: instrumentalAsset });
                vocals = v;
                jobRef.current = '';
            }
            if (aiMode !== 'separate') {
                setBusy(vocals ? 'Transcribing isolated vocals…' : 'Transcribing original audio…');
                const source = await extractAudio(vocals ?? asset.file);
                ctrl.signal.throwIfAborted();
                const form = new FormData();
                form.append('file', source, 'vocals.wav');
                if (language)
                    form.append('language', language);
                const data = await aiRequest('/api/ai?action=transcribe', { method: 'POST', body: form }, ctrl.signal);
                const words = (data.words ?? []) as {
                    word: string;
                    start: number;
                    end: number;
                }[];
                const cs: Caption[] = [];
                let group: typeof words = [];
                const flush = () => { if (!group.length)
                    return; const c = caption('', group[0].start, Math.max(group[0].start + .1, group.at(-1)!.end)); c.words = group.flatMap((w, i) => [...(i ? [{ ...baseStyle, text: ' ' }] : []), { ...baseStyle, text: w.word.trim(), start: w.start, end: w.end }]); c.review = (data.segments ?? []).some((s: {
                    start: number;
                    end: number;
                    avg_logprob: number;
                }) => s.avg_logprob < -.8 && s.start < c.end && s.end > c.start); cs.push(c); group = []; };
                for (const w of words) {
                    if (group.length && (w.start - group.at(-1)!.end > .7 || group.length >= 7 || w.end - group[0].start > 4))
                        flush();
                    group.push(w);
                    if (/[.!?]$/.test(w.word))
                        flush();
                }
                flush();
                if (!cs.length) {
                    for (const s of data.segments ?? [])
                        cs.push(caption(s.text.trim(), s.start, Math.max(s.start + .1, s.end)));
                }
                if (!cs.length)
                    throw new Error('No words were detected. Try the original audio or another language.');
                commit(p => ({ ...p, captions: cs, duration: Math.max(p.duration, ...cs.map(c => c.end)) }));
                setSelection([cs[0].id]);
                seek(cs[0].start);
                setTab('transcript');
                setSample(false);
                announce(`${cs.length} editable captions ready. Review the transcript before exporting.`);
            }
            else {
                setTab('media');
                announce('Vocal and instrumental tracks are ready to preview.');
            }
            setAiOpen(false);
        }
        catch (e) {
            if (ctrl.signal.aborted)
                announce('Processing canceled. Your existing captions are unchanged.');
            else
                fail(e);
        }
        finally {
            setBusy('');
            abortRef.current = null;
        }
    }
    async function cancelProcessing() { abortRef.current?.abort(); if (jobRef.current) {
        const id = jobRef.current;
        jobRef.current = '';
        try {
            await aiRequest('/api/ai?action=cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
        }
        catch (e) {
            fail(e);
        }
    } }
    async function doExport() { setError(''); setPlaying(false); setEditing(null); setProgress(0); const ctrl = new AbortController(); abortRef.current = ctrl; try {
        const audio = exportAudio === 'none' ? null : exportAudio === 'original' ? asset?.file ?? null : stems?.[exportAudio as 'vocals' | 'instrumental'].file ?? null;
        const blob = await exportMp4(structuredClone(project), asset?.hasVideo ? asset.file : null, audio, resolution, fps, setProgress, ctrl.signal);
        download(blob, `${filename.replace(/[<>:"/\\|?*]/g, '-') || 'verse-video'}.mp4`);
        if (exportResult)
            URL.revokeObjectURL(exportResult.url);
        setExportResult({ url: URL.createObjectURL(blob), size: blob.size });
        announce('Your captioned MP4 is ready.');
    }
    catch (e) {
        if (ctrl.signal.aborted)
            announce('Export canceled.');
        else
            fail(e);
    }
    finally {
        setProgress(null);
        abortRef.current = null;
    } }
    const renderedBoxes = (() => { const ctx = canvas.current?.getContext('2d'); return active.map(c => ({ c, height: ctx ? layoutCaption(ctx, c).height : 120 })); })();
    return <TooltipProvider delayDuration={400}><main className="studio" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file && !busy && progress === null)
        void importMedia(file); }}>
 <input hidden type="file" ref={mediaInput} accept="video/*,audio/*,.mkv,.mov,.flac" onChange={e => { if (e.target.files?.[0])
        void importMedia(e.target.files[0]); e.target.value = ''; }}/>
 <input hidden type="file" ref={projectInput} accept=".json" onChange={e => { if (e.target.files?.[0])
        void readProject(e.target.files[0]); e.target.value = ''; }}/>
 <input hidden type="file" ref={subtitleInput} accept=".srt,.vtt" onChange={e => { if (e.target.files?.[0])
        void readSubtitles(e.target.files[0]); e.target.value = ''; }}/>
 <input hidden type="file" ref={fontInput} accept=".ttf,.otf,.woff,.woff2" onChange={e => { if (e.target.files?.[0])
        void loadFont(e.target.files[0]); e.target.value = ''; }}/>
 <video aria-hidden="true" ref={video} src={asset?.url} preload="auto" playsInline className="source-media" onError={() => fail('This file cannot play in your browser. Try an H.264 MP4, MP3 or WAV.')} onEnded={() => { if (asset && asset.duration >= project.duration - .05)
        setPlaying(false); }}/>
 <audio aria-hidden="true" ref={stemAudio} src={track !== 'original' ? stems?.[track].url : undefined} preload="auto"/>
 <header className="topbar"><div className="brand"><span className="brandmark">v</span>verse<span className="beta">STUDIO</span></div><DropdownMenu><DropdownMenuTrigger className="project-name">{project.name}<ChevronDown size={14}/><span className="muted">{sample ? 'Typography sample' : saved ? 'Project saved' : 'Unsaved edits'}</span></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onSelect={save}><Save size={15}/> Save project</DropdownMenuItem><DropdownMenuItem onSelect={() => projectInput.current?.click()}><FolderOpen size={15}/> Open project</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => subtitleInput.current?.click()}><Upload size={15}/> Import subtitles</DropdownMenuItem><DropdownMenuItem onSelect={() => download(new Blob([toSrt(project.captions)], { type: 'text/plain' }), 'captions.srt')}><Download size={15}/> Download SRT</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => setAiOpen(true)}><Settings2 size={15}/> AI connections</DropdownMenuItem></DropdownMenuContent></DropdownMenu><div className="header-actions"><IconButton label="Import media" className="header-icon" onClick={() => mediaInput.current?.click()} disabled={!!busy}><Upload size={17}/></IconButton><button className="primary" onClick={() => { setFilename(project.name.toLowerCase().replace(/\s+/g, '-')); setExportOpen(true); }} disabled={!!busy}><Download size={16}/> Export video <ArrowUpRight size={15}/></button></div></header>
 <div className="workarea"><aside className="left-panel"><Tabs value={tab} onValueChange={setTab}><TabsList className="panel-tabs"><TabsTrigger value="media">Media</TabsTrigger><TabsTrigger value="transcript">Transcript</TabsTrigger></TabsList><TabsContent value="media"><button className="upload-area" onClick={() => mediaInput.current?.click()} disabled={!!busy}><Upload size={23}/><strong>{asset ? 'Replace or relink media' : 'Bring your story in'}</strong><span>Drop a video or audio file</span><small>MP4, MOV, MP3, WAV · up to 12 min</small></button>{asset && <div className="asset-card"><div className="asset-icon">{asset.hasVideo ? <Film size={22}/> : <AudioLines size={22}/>}</div><div><strong title={asset.name}>{asset.name}</strong><small>{time(asset.duration)} · {(asset.file.size / 1024 / 1024).toFixed(1)} MB</small></div><Check size={14}/></div>}<div className="section-label">AUDIO TRACKS</div>{(['original', 'vocals', 'instrumental'] as const).map((type, i) => <div className={'audio-row ' + (track === type ? 'listening' : '')} key={type}><button disabled={!asset || (type !== 'original' && !stems)} onClick={() => { setTrack(type); seek(current); }}>{i === 0 ? <AudioLines size={17}/> : i === 1 ? <Type size={17}/> : <Music2 size={17}/>}<span>{i === 0 ? 'Original audio' : i === 1 ? 'Vocals only' : 'Instrumental only'}<small>{i === 0 ? asset ? 'Imported' : 'No media' : stems ? 'Separated stem' : 'Separate to preview'}</small></span>{track === type && asset && <Volume2 size={14}/>}</button>{type !== 'original' && stems && <IconButton label={`Download ${type}`} onClick={() => download(stems[type].file, `${type}.wav`)}><Download size={14}/></IconButton>}</div>)}<button className="ai-button full" onClick={() => { setAiMode('separate'); setAiOpen(true); }} disabled={!asset?.hasAudio || !!busy}><Sparkles size={16}/> Separate vocals</button><div className="tip"><Info size={16}/><p>Listen to isolated vocals for cleaner transcription. Your original audio stays available for export.</p></div></TabsContent><TabsContent value="transcript"><div className="panel-heading"><h2>Every word, in place.</h2><p>{sample ? 'A little inspiration. Make it yours.' : 'Edit a line to shape your story.'}</p></div><button className="ai-button" onClick={() => { setAiMode(stems ? 'transcribe' : 'both'); setAiOpen(true); }} disabled={!!busy}><Sparkles size={16}/> Generate captions</button><div className="section-label">CAPTIONS <span>{String(project.captions.length).padStart(2, '0')}</span></div><div className="transcript-lines">{[...project.captions].sort((a, b) => a.start - b.start).map((c, i) => <div key={c.id} className={'transcript-line ' + (selection.includes(c.id) ? 'selected' : '')} onClick={e => select(c.id, e.shiftKey || e.ctrlKey || e.metaKey)}><button className="line-number" aria-label={`Select caption ${i + 1}`}>{String(i + 1).padStart(2, '0')}</button><div><small>{time(c.start)} → {time(c.end)}</small><textarea aria-label={`Caption ${i + 1} text`} value={plain(c)} rows={Math.max(1, Math.ceil(plain(c).length / 22))} onClick={e => { e.stopPropagation(); if (!selection.includes(c.id)) {
        setSelection([c.id]);
        seek(c.start + .001);
    } setPlaying(false); }} onFocus={() => { checkpoint(); setEditing(null); setSelectedWords([]); }} onChange={e => editText(c.id, e.target.value, false)}/>{c.review && <button className="review-badge" onClick={e => { e.stopPropagation(); commit(p => ({ ...p, captions: p.captions.map(x => x.id === c.id ? { ...x, review: false } : x) })); }}>Check wording · mark reviewed</button>}</div></div>)}</div>{!project.captions.length && <div className="empty-copy">Generate captions from your audio, import subtitles, or add your first line.</div>}<button className="quiet full" onClick={add}><Plus size={16}/> Add caption</button><button className="text-button full" onClick={() => subtitleInput.current?.click()}>Import SRT / VTT</button><div className="tip"><MousePointer2 size={17}/><p>Select words on the canvas to give them their own voice.</p></div></TabsContent></Tabs></aside>
 <section className="center-panel"><div className="canvas-toolbar"><span><MousePointer2 size={15}/> Canvas {sample && <span className="sample-label">SAMPLE</span>}</span><span className="muted">16:9 <IconButton label="Fullscreen canvas" onClick={() => { if (document.fullscreenElement)
        void document.exitFullscreen();
    else
        void shell.current?.requestFullscreen().catch(fail); }}><Maximize2 size={14}/></IconButton></span></div><div className="stage" onClick={() => { setSelection([]); setSelectedWords([]); setEditing(null); }}><div ref={shell} className="preview-shell" style={{ background: project.background }}><canvas ref={canvas} width={1920} height={1080} aria-label="Live caption and video preview"/>{renderedBoxes.map(({ c, height }) => <div key={c.id} className={'caption-overlay ' + (selection.includes(c.id) ? 'is-selected' : '') + (editing === c.id ? ' is-editing' : '')} style={{ left: `${c.x}%`, top: `${c.y}%`, width: `${c.width}%`, minHeight: `${height / 1080 * 100}%` }} onClick={e => e.stopPropagation()} onPointerDown={e => canvasDrag(e, c.id)} onDoubleClick={() => { setSelection([c.id]); setPlaying(false); setEditing(c.id); checkpoint(); setTimeout(() => wordEditor.current?.focus(), 0); }}>{editing === c.id ? <CanvasText caption={c} editorRef={wordEditor} onText={text => editText(c.id, text, false)} onSelection={setSelectedWords}/> : null}{selection.includes(c.id) && <><span className="caption-name">{editing === c.id ? 'EDIT TEXT' : 'CAPTION'}</span><button className="drag-grip" aria-label="Drag caption" onPointerDown={e => { if (editing === c.id) {
        setEditing(null);
    } canvasDrag(e, c.id); }}><Grip size={13}/></button><button className="resize-handle" aria-label="Scale caption" onPointerDown={e => canvasDrag(e, c.id, true)}/></>}</div>)}</div></div><div className="transport"><span className="timecode">{time(current)}<span> / {time(project.duration)}</span></span><div className="transport-buttons"><IconButton label="Previous caption" onClick={() => navigate(-1)}><SkipBack size={16}/></IconButton><button className="play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => { setEditing(null); if (current >= project.duration)
        seek(0); setPlaying(p => !p); }}>{playing ? <Pause size={17} fill="currentColor"/> : <Play size={17} fill="currentColor"/>}</button><IconButton label="Next caption" onClick={() => navigate(1)}><SkipForward size={16}/></IconButton></div><IconButton label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(m => !m)}>{muted ? <VolumeX size={16}/> : <Volume2 size={16}/>}</IconButton></div><div className="canvas-hint">Double-click to edit text <span>·</span> Drag to reposition <span>·</span> Shift-click to select more</div>{!fontReady && <button className="font-notice" onClick={() => setFontOpen(true)}>Gill Sans MT isn’t available on this device. Load your font for an exact match.</button>}</section>
 <aside className="right-panel"><div className="properties-heading">{chosen ? <Type size={18}/> : <Settings2 size={18}/>}<h2>{selectedWords.length ? 'Word selection' : chosen ? 'Caption' : 'Project'}</h2>{chosen && <span className="badge">{selectedWords.length ? `${selectedWords.length} tokens` : `${selection.length} selected`}</span>}</div>{chosen ? <><section className="property-group"><label>Typography {selectedWords.length > 0 && <button className="tiny-button" onClick={() => { setSelectedWords([]); window.getSelection()?.removeAllRanges(); }}>Whole caption</button>}</label><select aria-label="Font family" value={chosen.font} onChange={e => patchCaptions({ font: e.target.value })}>{['Gill Sans MT', 'Arial', 'Georgia', 'Verdana', 'Trebuchet MS'].map(f => <option key={f}>{f}</option>)}</select><div className="field-row"><select aria-label="Font style" value={styledWord.bold ? styledWord.italic ? 'bold italic' : 'bold' : styledWord.italic ? 'italic' : 'regular'} onChange={e => format({ bold: e.target.value.includes('bold'), italic: e.target.value.includes('italic') })}><option value="regular">Regular</option><option value="bold">Bold</option><option value="italic">Italic</option><option value="bold italic">Bold Italic</option></select><NumberField label="Size" value={styledWord.size} min={8} max={400} step={1} onChange={size => format({ size })}/></div><div className="format-buttons"><IconButton label="Bold" className={styledWord.bold ? 'active' : ''} onMouseDown={e => e.preventDefault()} onClick={() => format({ bold: !styledWord.bold })}><b>B</b></IconButton><IconButton label="Italic" className={styledWord.italic ? 'active' : ''} onMouseDown={e => e.preventDefault()} onClick={() => format({ italic: !styledWord.italic })}><i>I</i></IconButton><IconButton label="Bold italic" className={styledWord.bold && styledWord.italic ? 'active' : ''} onMouseDown={e => e.preventDefault()} onClick={() => format({ bold: true, italic: true })}><b><i>BI</i></b></IconButton><span className="separator"/>{(['left', 'center', 'right'] as const).map((align, i) => <IconButton key={align} label={`Align ${align}`} className={chosen.align === align ? 'active' : ''} onClick={() => patchCaptions({ align })}>{i === 0 ? <AlignLeft size={16}/> : i === 1 ? <AlignCenter size={16}/> : <AlignRight size={16}/>}</IconButton>)}</div><label>Text color</label><div className="color-field"><input aria-label="Text color" type="color" value={styledWord.color} onChange={e => format({ color: e.target.value })}/><span>{styledWord.color.slice(1).toUpperCase()}</span><span className="muted">100%</span></div><button className="text-button" onClick={() => setFontOpen(true)}>Load Gill Sans font files</button></section><section className="property-group"><label>Position & spacing</label><div className="field-row"><NumberField label="X %" value={chosen.x} min={0} max={100 - chosen.width} onChange={x => patchCaptions({ x })}/><NumberField label="Y %" value={chosen.y} min={0} max={95} onChange={y => patchCaptions({ y })}/></div><div className="field-row"><NumberField label="Line" value={chosen.lineHeight} min={.7} max={3} onChange={lineHeight => patchCaptions({ lineHeight })}/><NumberField label="Track" value={chosen.spacing} min={-10} max={30} onChange={spacing => patchCaptions({ spacing })}/></div><div className="field-row"><NumberField label="Scale" value={chosen.scale} min={.1} max={5} onChange={scale => patchCaptions({ scale })}/><NumberField label="Width %" value={chosen.width} min={5} max={100 - chosen.x} onChange={width => patchCaptions({ width })}/></div><button className="quiet full" onClick={centerCaptions}><AlignCenter size={15}/> Center on canvas</button></section><section className="property-group"><label>Caption timing <span className="muted">seconds</span></label><div className="field-row"><NumberField label="In" value={chosen.start} min={0} max={chosen.end - .05} step={.01} onChange={v => changeTiming(chosen.id, 'start', v)}/><NumberField label="Out" value={chosen.end} min={chosen.start + .05} max={project.duration} step={.01} onChange={v => changeTiming(chosen.id, 'end', v)}/></div>{selectedWords.length === 1 && chosen.words[selectedWords[0]]?.start !== undefined && <><label>Selected word timing</label><div className="field-row"><NumberField label="Word in" value={chosen.words[selectedWords[0]].start!} min={chosen.start} max={chosen.words[selectedWords[0]].end! - .01} step={.01} onChange={v => commit(p => ({ ...p, captions: p.captions.map(c => c.id === chosen.id ? { ...c, words: c.words.map((w, i) => i === selectedWords[0] ? { ...w, start: v } : w) } : c) }))}/><NumberField label="Word out" value={chosen.words[selectedWords[0]].end!} min={chosen.words[selectedWords[0]].start! + .01} max={chosen.end} step={.01} onChange={v => commit(p => ({ ...p, captions: p.captions.map(c => c.id === chosen.id ? { ...c, words: c.words.map((w, i) => i === selectedWords[0] ? { ...w, end: v } : w) } : c) }))}/></div></>}</section><div className="secondary-actions"><IconButton label="Copy formatting" onClick={() => { copiedStyle.current = structuredClone(chosen); force(n => n + 1); announce('Formatting copied.'); }}><Copy size={15}/></IconButton><IconButton label="Paste formatting" disabled={!copiedStyle.current} onClick={() => { const s = copiedStyle.current!; commit(p => ({ ...p, captions: p.captions.map(c => selection.includes(c.id) ? { ...c, font: s.font, scale: s.scale, spacing: s.spacing, lineHeight: s.lineHeight, align: s.align, words: c.words.map((w, i) => ({ ...w, ...Object.fromEntries(Object.entries(s.words[i] ?? s.words[0] ?? baseStyle).filter(([key]) => ['size', 'color', 'bold', 'italic'].includes(key))) })) } : c) })); }}><ClipboardPaste size={15}/></IconButton><IconButton label="Reset formatting" onClick={reset}><RotateCcw size={15}/></IconButton><IconButton label="Delete selected captions" onClick={remove}><Trash2 size={15}/></IconButton></div></> : <><section className="property-group"><label htmlFor="project-title">Project name</label><input id="project-title" value={project.name} onChange={e => commit(p => ({ ...p, name: e.target.value }))}/><NumberField label="Duration" value={project.duration} min={Math.max(.5, asset?.duration ?? 0, ...project.captions.map(c => c.end))} max={720} step={1} onChange={duration => commit(p => ({ ...p, duration }))}/><label>Canvas format</label><div className="readout">16:9 · Landscape</div></section><div className="empty-copy">Select a caption on the canvas or timeline to edit its typography.</div><button className="quiet full" onClick={() => setSelection(project.captions.map(c => c.id))}>Select all captions</button></>}<section className="property-group"><label>Canvas background</label><div className="color-field"><input aria-label="Canvas background color" type="color" value={project.background} onChange={e => commit(p => ({ ...p, background: e.target.value }))}/><span>{project.background.slice(1).toUpperCase()}</span><span className="muted">100%</span></div></section></aside></div>
 <section className="timeline"><div className="timeline-toolbar"><div><IconButton label="Undo (Ctrl Z)" onClick={undo} disabled={!undoStack.current.length}><Undo2 size={16}/></IconButton><IconButton label="Redo (Ctrl Shift Z)" onClick={redo} disabled={!redoStack.current.length}><Redo2 size={16}/></IconButton><span className="separator"/><IconButton label="Split at playhead" onClick={split} disabled={!chosen}><Scissors size={16}/></IconButton><IconButton label="Duplicate captions" onClick={duplicate} disabled={!chosen}><Copy size={16}/></IconButton><IconButton label="Merge selected captions" onClick={merge} disabled={selection.length < 2}><Merge size={16}/></IconButton><IconButton label="Delete captions" onClick={remove} disabled={!chosen}><Trash2 size={16}/></IconButton><IconButton label="Add caption" onClick={add}><Plus size={16}/></IconButton></div><span className="muted">Timeline</span><div className="zoom"><button aria-label="Zoom out" onClick={() => setZoom(z => Math.max(1, z - .5))}>−</button><input aria-label="Timeline zoom" type="range" min={1} max={6} step={.25} value={zoom} onChange={e => setZoom(+e.target.value)}/><button aria-label="Zoom in" onClick={() => setZoom(z => Math.min(6, z + .5))}>+</button></div></div><div className="track-grid"><div className="track-labels"><div /><div><Film size={15}/>{asset?.hasVideo ? 'Video' : 'Original'}</div><div><AudioLines size={15}/> Vocals</div><div><Music2 size={15}/> Instrumental</div><div><Type size={15}/> Captions</div></div><div className="timeline-scroll"><div className="timeline-content" style={{ width: `${zoom * 100}%` }}><div className="ruler" onPointerDown={e => { const rect = e.currentTarget.getBoundingClientRect(); setPlaying(false); seek((e.clientX - rect.left) / rect.width * project.duration); e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (e.buttons === 1) {
        const rect = e.currentTarget.getBoundingClientRect();
        seek((e.clientX - rect.left) / rect.width * project.duration);
    } }}>{Array.from({ length: Math.ceil(zoom * 6) + 1 }, (_, i) => <span key={i}>{time(i * project.duration / (Math.ceil(zoom * 6))).slice(0, 5)}</span>)}</div><div className="empty-track original-track">{asset ? <><Wave peaks={asset.peaks} color="#83b9c5"/><span className="track-name">{asset.name}</span></> : <button onClick={() => mediaInput.current?.click()}><Upload size={13}/> Import media to add your video and audio tracks</button>}</div><div className="empty-track vocals-track">{stems ? <Wave peaks={stems.vocals.peaks} color="#ad9eda"/> : <span>Vocals appear after separation</span>}</div><div className="empty-track instrumental-track">{stems ? <Wave peaks={stems.instrumental.peaks} color="#83adb2"/> : <span>Instrumental appears after separation</span>}</div><div className="caption-track">{project.captions.map(c => <div role="button" tabIndex={0} aria-label={`Timeline caption: ${plain(c)}`} key={c.id} onKeyDown={e => { if (e.key === 'Enter')
        select(c.id, e.shiftKey || e.ctrlKey); }} onPointerDown={e => timelineDrag(e, c)} className={'caption-clip ' + (selection.includes(c.id) ? 'active' : '')} style={{ left: `${c.start / project.duration * 100}%`, width: `${(c.end - c.start) / project.duration * 100}%` }}><span className="timing-handle start" role="slider" tabIndex={0} aria-label={`Start time of ${plain(c)}`} aria-valuemin={0} aria-valuemax={c.end} aria-valuenow={c.start} onPointerDown={e => timelineDrag(e, c, 'start')} onKeyDown={e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.stopPropagation();
        e.preventDefault();
        changeTiming(c.id, 'start', c.start + (e.key === 'ArrowRight' ? .1 : -.1));
    } }}/><Type size={13}/><span>{plain(c)}</span><span className="timing-handle end" role="slider" tabIndex={0} aria-label={`End time of ${plain(c)}`} aria-valuemin={c.start} aria-valuemax={project.duration} aria-valuenow={c.end} onPointerDown={e => timelineDrag(e, c, 'end')} onKeyDown={e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.stopPropagation();
        e.preventDefault();
        changeTiming(c.id, 'end', c.end + (e.key === 'ArrowRight' ? .1 : -.1));
    } }}/></div>)}</div><div className="playhead" style={{ left: `${current / project.duration * 100}%` }}/></div></div></div></section>
 <footer className="statusbar"><span>{busy ? <><LoaderCircle className="spin" size={12}/> {busy}</> : saved ? <><Check size={12}/> Project saved</> : <>Edits stay on this device · <button onClick={save}>Save project</button></>}</span><span>{chosen?.font ?? 'Gill Sans MT'} · 1920 × 1080 <span className="footer-brand">MADE TO BE HEARD.</span></span></footer>
 {(notice || error) && <div className={'toast ' + (error ? 'error' : '')} role={error ? 'alert' : 'status'}>{error ? <Info size={17}/> : <Check size={17}/>}<span>{error || notice}</span><button aria-label="Dismiss message" onClick={() => { setError(''); setNotice(''); }}><X size={15}/></button></div>}
 <Dialog open={aiOpen} onOpenChange={v => { if (!busy)
        setAiOpen(v); }}><DialogContent className="editor-dialog"><div className="dialog-emblem"><Sparkles size={23}/></div><DialogTitle>Let the words find their place.</DialogTitle><DialogDescription>Separate your vocals, then turn them into editable, timed captions.</DialogDescription>{!asset ? <button className="upload-area" onClick={() => { setAiOpen(false); mediaInput.current?.click(); }}><Upload /><strong>Upload your video or audio first</strong></button> : <><label>Workflow<select value={aiMode} disabled={!!busy} onChange={e => setAiMode(e.target.value)}><option value="both">Separate vocals → transcribe → captions</option><option value="separate">Separate vocals and instrumental only</option><option value="transcribe">Transcribe {stems ? 'isolated vocals' : 'original audio'}</option></select></label>{aiMode !== 'transcribe' && <label>Replicate API key<input type="password" autoComplete="off" value={apiKeys.replicate} disabled={!!busy} onChange={e => setApiKeys(k => ({ ...k, replicate: e.target.value }))} placeholder="r8_…"/><small><a href="https://replicate.com/account/api-tokens" target="_blank" rel="noreferrer">Get a Replicate key ↗</a></small></label>}{aiMode !== 'separate' && <><label>OpenAI API key<input type="password" autoComplete="off" value={apiKeys.openai} disabled={!!busy} onChange={e => setApiKeys(k => ({ ...k, openai: e.target.value }))} placeholder="sk-…"/><small><a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">Get an OpenAI key ↗</a></small></label><label>Language<select value={language} disabled={!!busy} onChange={e => setLanguage(e.target.value)}><option value="">Detect automatically</option>{[['en', 'English'], ['ne', 'Nepali'], ['hi', 'Hindi'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['ja', 'Japanese'], ['ko', 'Korean'], ['pt', 'Portuguese'], ['ar', 'Arabic']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label></>}<div className="dialog-note">Audio is sent to {aiMode === 'both' ? 'Replicate and OpenAI' : aiMode === 'separate' ? 'Replicate' : 'OpenAI'} when you run this workflow. Provider charges apply. Keys stay in memory for this session. {aiMode !== 'separate' && 'Generated captions replace the current transcript; Undo restores it.'}</div>{busy ? <div className="processing"><LoaderCircle className="spin" size={18}/><span>{busy}</span><button className="quiet" onClick={() => void cancelProcessing()}>Cancel</button></div> : <button className="primary" disabled={!asset.hasAudio || (aiMode !== 'transcribe' && !apiKeys.replicate) || (aiMode !== 'separate' && !apiKeys.openai)} onClick={() => void runAI()}><Sparkles size={16}/> Run workflow</button>}</>}{error && <p className="inline-error" role="alert">{error}</p>}</DialogContent></Dialog>
 <Dialog open={fontOpen} onOpenChange={setFontOpen}><DialogContent className="editor-dialog"><DialogTitle>Your typography, exactly.</DialogTitle><DialogDescription>Gill Sans MT Regular is the default. If it is not installed, load your licensed font files here. They stay on this device for this session.</DialogDescription><label>Font variant<select value={fontVariant} onChange={e => setFontVariant(e.target.value)}><option value="regular">Regular</option><option value="bold">Bold</option><option value="italic">Italic</option><option value="bold italic">Bold Italic</option></select></label><button className="primary" onClick={() => fontInput.current?.click()}><Upload size={16}/> Choose font file</button><div className="dialog-note">Load each variant for the closest reference match. Without the original font, the browser uses a fallback; preview and export use the same resolved font.</div></DialogContent></Dialog>
 <Dialog open={exportOpen} onOpenChange={v => { if (progress === null)
        setExportOpen(v); }}><DialogContent className="editor-dialog"><div className="dialog-emblem"><Film size={23}/></div><DialogTitle>Ready for the final cut.</DialogTitle><DialogDescription>Your captions, styling, and timing are burned directly into the video.</DialogDescription><label>Filename<div className="filename-field"><input aria-label="Export filename" disabled={progress !== null} value={filename} onChange={e => setFilename(e.target.value)}/><span>.mp4</span></div></label><div className="field-row"><label>Resolution<select value={resolution} disabled={progress !== null} onChange={e => setResolution(+e.target.value)}><option value={1080}>1080p · Full HD</option><option value={2160}>4K · Ultra HD</option></select></label><label>Frame rate<select value={fps} disabled={progress !== null} onChange={e => setFps(+e.target.value)}><option value={30}>30 FPS</option><option value={60}>60 FPS</option></select></label></div><label>Audio<select value={exportAudio} disabled={progress !== null} onChange={e => setExportAudio(e.target.value)}><option value="original">Original audio</option><option value="vocals" disabled={!stems}>Vocals only</option><option value="instrumental" disabled={!stems}>Instrumental only</option><option value="none">No audio</option></select></label>{exportResult && <div className="export-result"><video controls src={exportResult.url} aria-label="Rendered MP4 preview"/><a className="quiet full" download={`${filename}.mp4`} href={exportResult.url}><Download size={15}/> Download rendered MP4 · {(exportResult.size / 1024 / 1024).toFixed(1)} MB</a></div>}<div className="export-summary"><span>MP4 · H.264 + AAC</span><span>{time(project.duration)} · {project.captions.length} captions</span></div>{!fontReady && <p className="dialog-note">Gill Sans MT is unavailable. Your export will match the fallback font shown in the preview. Load your font for an exact Gill Sans match.</p>}<p className="dialog-note">Video is rendered locally at high quality; audio is encoded at 256 kbps. Keep this tab open. 4K / 60 FPS needs a capable device and browser.</p>{progress !== null ? <><progress value={progress} max={1}/><div className="processing"><span>{Math.round(progress * 100)}% rendered</span><button className="quiet" onClick={() => abortRef.current?.abort()}>Cancel export</button></div></> : <button className="primary" onClick={() => void doExport()}><Download size={16}/> Export MP4 <ArrowUpRight size={16}/></button>}{error && <p className="inline-error" role="alert">{error}</p>}</DialogContent></Dialog>
 </main></TooltipProvider>;
}
