"use client";
import EditorContextMenu, { MenuAction, type ContextTarget } from './editor-context-menu';
import CaptionSetupControls, { type CaptionSetup } from './caption-setup';
import { copyCaptionStyle, reorderCaptions, marqueeIds } from '@/lib/style-transfer';
import MotionControls from './motion-controls';
import { ensureFont, registerLoadedFont, resolvedFont } from '@/lib/fonts';
import { snap, snapGroup, timeBoundaries } from '@/lib/snapping';
import { captionOrigin } from '@/lib/editor';
import CanvasText from "./canvas-text";
import MixerPanel from './mixer-panel';
import { CaptionControls, BreakControls, EmphasisControls } from './caption-controls';
import { groupWords, styleCaption, scaleCaption, manualStyle, emphasize, emphasisCandidates, removeAuto, defaultEmphasis, type EmphasisOptions } from '@/lib/caption-tools';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Upload, Sparkles, Play, Pause, Plus, Type, Music2, AudioLines, Film, Download, Undo2, Redo2, MousePointer2, Scissors, ChevronDown, Copy, Trash2, AlignLeft, AlignCenter, AlignRight, SkipBack, SkipForward, Volume2, VolumeX, Check, Settings2, FolderOpen, Save, ClipboardPaste, Merge, RotateCcw, LoaderCircle, Maximize2, X, Grip, Info } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { baseStyle, defaultMixer, defaultRules, trackGain, type TrackName, type Mixer, caption, clamp, drawProject, fontString, initialProject, layoutCaption, parseSrt, plain, shiftCaption, splitCaption, time, toSrt, tokenize, uid, validateProject, type Box, type Caption, type Project, type Word, type WordStyle } from '@/lib/editor';
import { download, exportMp4, mixAudio, decodePcm, inspectMedia, waveform } from '@/lib/media';
import { runLocalAI, wavBlob } from '@/lib/local-ai';
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
type Stems = Partial<Record<'vocals' | 'instrumental', Asset>>;
export default function EditorStudio() {
    const [project, setProject] = useState<Project>(initialProject), [selection, setSelection] = useState<string[]>([]), [selectedWords, setSelectedWords] = useState<number[]>([]), [editing, setEditing] = useState<string | null>(null), [tab, setTab] = useState('transcript');
    const [current, setCurrent] = useState(.2), [playing, setPlaying] = useState(false), [muted, setMuted] = useState(false), [zoom, setZoom] = useState(1), [asset, setAsset] = useState<Asset | null>(null), [stems, setStems] = useState<Stems | null>(null);
    const [notice, setNotice] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(''), [sample, setSample] = useState(true), [saved, setSaved] = useState(false), [fontReady, setFontReady] = useState(true), [fontTick, setFontTick] = useState(0), [fontOpen, setFontOpen] = useState(false), [fontVariant, setFontVariant] = useState('regular');
    const [aiOpen, setAiOpen] = useState(false), [aiMode, setAiMode] = useState('both'), [language, setLanguage] = useState(''), [exportOpen, setExportOpen] = useState(false), [resolution, setResolution] = useState(1080), [fps, setFps] = useState(30), [filename, setFilename] = useState('untitled-sequence'), [exportAudio, setExportAudio] = useState('mixer'), [progress, setProgress] = useState<number | null>(null), [exportResult, setExportResult] = useState<{
        url: string;
        size: number;
    } | null>(null);
    const [scopeAll, setScopeAll] = useState(false), [preserveStyles, setPreserveStyles] = useState(true);
    const [customFonts, setCustomFonts] = useState<string[]>([]), [fontFamilyInput, setFontFamilyInput] = useState('My custom font');
    const [emphasisOptions, setEmphasisOptions] = useState<EmphasisOptions>(defaultEmphasis), [emphasisEnabled, setEmphasisEnabled] = useState(false), [emphasisSelected, setEmphasisSelected] = useState(true), [emphasisBusy, setEmphasisBusy] = useState('');
    const [canvasGuides, setCanvasGuides] = useState({ x: false, y: false }), [timelineGuide, setTimelineGuide] = useState<number | null>(null);
    const [setup, setSetup] = useState<CaptionSetup>({ rules: { ...defaultRules, limitBy: 'words' }, emphasis: false, level: 'low' });
    const [menu, setMenu] = useState<ContextTarget | null>(null), [multiSelectMode, setMultiSelectMode] = useState(false);
    const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
    const [canvasZoom, setCanvasZoom] = useState<number | null>(null), [fitScale, setFitScale] = useState(.25);
    const viewport = useRef<HTMLDivElement>(null), fitRef = useRef(.25), copiedCaptions = useRef<Caption[]>([]);
    const [bulkText, setBulkText] = useState<Record<string,string> | null>(null);
    const mixer = project.mixer ?? defaultMixer, rules = project.captionRules ?? defaultRules;
    const availableTracks: TrackName[] = [...(asset?.hasAudio ? ['original' as const] : []), ...(stems?.vocals ? ['vocals' as const] : []), ...(stems?.instrumental ? ['instrumental' as const] : [])];
    const fontFamilies = [...new Set(['Inter Variable', 'Lora Variable', 'Montserrat Variable', 'Gill Sans MT', 'Arial', 'Georgia', 'Verdana', 'Trebuchet MS', ...customFonts, ...project.captions.map(c => c.font)])];
    const [, force] = useState(0);
    const fontKey = [...new Set(project.captions.map(c => c.font))].sort().join('|');
    useEffect(() => { let live = true; void Promise.all(fontKey.split('|').filter(Boolean).map(f => ensureFont(f))).then(() => { if (live) setFontTick(t => t + 1); }); return () => { live = false; }; }, [fontKey]);
    const undoStack = useRef<Project[]>([]), redoStack = useRef<Project[]>([]), copiedStyle = useRef<Caption | null>(null), projectRef = useRef(project), selectionRef = useRef(selection), timeRef = useRef(current), playingRef = useRef(playing), editingRef = useRef(editing), boxes = useRef<Box[]>([]), canvas = useRef<HTMLCanvasElement>(null), shell = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null), vocalAudio = useRef<HTMLAudioElement>(null), instrumentalAudio = useRef<HTMLAudioElement>(null), mediaInput = useRef<HTMLInputElement>(null), projectInput = useRef<HTMLInputElement>(null), subtitleInput = useRef<HTMLInputElement>(null), fontInput = useRef<HTMLInputElement>(null), wordEditor = useRef<HTMLDivElement>(null), abortRef = useRef<AbortController | null>(null), assetGeneration = useRef(0);
    projectRef.current = project;
    selectionRef.current = selection;
    timeRef.current = current;
    playingRef.current = playing;
    editingRef.current = editing;
    useEffect(() => {
        const node = shell.current, stage = viewport.current;
        if (!node || !stage) return;
        const fit = () => {
            const fitted = Math.max(.01, Math.min((stage.clientWidth - 48) / 1920, (stage.clientHeight - 48) / 1080));
            fitRef.current = fitted; setFitScale(fitted);
            const oldWidth = node.getBoundingClientRect().width;
            const ratio = (1920 * (canvasZoom ?? fitted)) / Math.max(1, oldWidth);
            const centerX = stage.scrollLeft + stage.clientWidth / 2, centerY = stage.scrollTop + stage.clientHeight / 2;
            node.style.width = 1920 * (canvasZoom ?? fitted) + 'px'; node.style.height = 1080 * (canvasZoom ?? fitted) + 'px';
            if (canvasZoom === null) stage.scrollTo(0,0); else stage.scrollTo(Math.max(0,centerX*ratio-stage.clientWidth/2),Math.max(0,centerY*ratio-stage.clientHeight/2));
        };
        const observer = new ResizeObserver(fit); observer.observe(stage); fit();
        return () => observer.disconnect();
    }, [canvasZoom]);
    useEffect(() => {
        const stage = viewport.current; if(!stage) return;
        const wheel = (e: WheelEvent) => { if(e.ctrlKey || e.metaKey) { e.preventDefault(); setCanvasZoom(z => clamp((z ?? fitRef.current) * Math.exp(-e.deltaY * .002), .05, 2)); } };
        stage.addEventListener('wheel',wheel,{passive:false});return()=>stage.removeEventListener('wheel',wheel);
    }, []);
    const chosen = project.captions.find(c => c.id === selection[0]);
    const active = project.captions.filter(c => current >= c.start && current < c.end);
    const activeKey = active.map(c => c.id).join('|');
    useEffect(() => {
        if (!playing) return;
        setSelection(activeKey ? activeKey.split('|') : []); setSelectedWords([]); setEditing(null);
        const node = document.querySelector<HTMLElement>('[data-caption-id="' + (activeKey.split('|')[0] ?? '') + '"]');
        node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [activeKey, playing]);
    const styledWord = selectedWords.length ? chosen?.words[selectedWords[0]] ?? baseStyle : { ...baseStyle, size: chosen?.baseSize ?? 90, color: chosen?.baseColor ?? '#ffffff' };
    const targetedWords = project.captions.filter(c => scopeAll || selection.includes(c.id)).flatMap(c => c.words.filter((w,i) => w.text.trim() && (scopeAll || !selectedWords.length || selectedWords.includes(i))));
    const allBold = targetedWords.length > 0 && targetedWords.every(w => w.bold), allItalic = targetedWords.length > 0 && targetedWords.every(w => w.italic);
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
        video.current.currentTime = Math.min(next, asset.duration); for (const a of [vocalAudio.current, instrumentalAudio.current]) if (a) a.currentTime = next; };
    const select = (id: string, multi = false, jump = true) => { setEditing(null); setSelectedWords([]); setSelection(s => multi ? s.includes(id) ? s.filter(x => x !== id) : [...s, id] : [id]); if (jump) {
        const c = projectRef.current.captions.find(c => c.id === id);
        if (c) {
            setPlaying(false);
            seek(c.start);
        }
    } };
    const patchCaptions = (patch: Partial<Caption>) => commit(p => ({ ...p, captions: p.captions.map(c => {
        if (!scopeAll && !selectionRef.current.includes(c.id)) return c;
        if (patch.align === 'center' && c.anchor !== 'center') {
            const ctx = canvas.current?.getContext('2d');
            const height = ctx ? layoutCaption(ctx, c).height : 0;
            return { ...c, anchor: 'center', x: 50, y: c.y + height / 21.6, ...patch };
        }
        return { ...c, ...patch };
    }) }));
    const format = (patch: Partial<WordStyle>) => commit(p => ({ ...p, captions: p.captions.map(c => scopeAll || selection.includes(c.id) ? selectedWords.length && !scopeAll ? { ...c, words: c.words.map((w, i) => selectedWords.includes(i) ? manualStyle(w, patch) : w) } : styleCaption(c, patch, preserveStyles) : c) }));
    const toggleFormat = (kind: 'bold' | 'italic' | 'both') => format(kind === 'both' ? { bold: !(allBold && allItalic), italic: !(allBold && allItalic) } : kind === 'bold' ? { bold: !allBold } : { italic: !allItalic });
    const copyStyle = () => { if (!chosen) return; copiedStyle.current = structuredClone(chosen); force(n => n + 1); announce('Complete caption style copied.'); };
    const pasteStyle = () => { const source = copiedStyle.current; if (!source) return; commit(p => ({ ...p, captions: p.captions.map(c => selection.includes(c.id) ? copyCaptionStyle(c,source) : c) })); };
    const applyAll = () => { if (!chosen) return; commit(p => ({ ...p, captions: p.captions.map(c => copyCaptionStyle(c,chosen)) })); announce('Complete style applied to all captions. Text and timing preserved.'); };
    const setMixerTrack = (key: TrackName, patch: Partial<Mixer[TrackName]>) => { setSaved(false); setProject(p => ({ ...p, mixer: { ...(p.mixer ?? defaultMixer), [key]: { ...(p.mixer ?? defaultMixer)[key], ...patch } } })); };
    const reflow = (all: boolean) => { const cs = project.captions.flatMap(c => all || selection.includes(c.id) ? groupWords(c.words, rules, c) : [c]); commit(p => ({ ...p, captions: cs })); setSelectedWords([]); setEditing(null); announce('Caption breaks updated. Word styles and timings preserved.'); };
    const removeEmphasis = () => { commit(p => ({ ...p, captions: p.captions.map(removeAuto) })); setEmphasisEnabled(false); };
    async function runEmphasis() {
        const targets = projectRef.current.captions.filter(c => !emphasisSelected || selection.includes(c.id));
        if (!targets.length) { announce('Select captions to emphasize first.'); return; }
        const ctrl = new AbortController(); abortRef.current = ctrl; setPlaying(false); setError('');
        try {
            setEmphasisBusy('Preparing local meaning analysis…');
            const result = await runLocalAI({ kind: 'emphasis', captions: targets.map(c => ({ id: c.id, text: plain(c), candidates: emphasisCandidates(c) })) }, ctrl.signal, setEmphasisBusy);
            if (result.kind !== 'emphasis') throw new Error('Unexpected emphasis result.');
            let audio: Float32Array | undefined;
            if (stems?.vocals) { setEmphasisBusy('Measuring vocal stress and pauses…'); [audio] = await decodePcm(stems.vocals.file, 16000, 1, ctrl.signal); }
            ctrl.signal.throwIfAborted();
            commit(p => ({ ...p, captions: p.captions.map(c => targets.some(t => t.id === c.id && plain(t) === plain(c)) ? emphasize(c, emphasisOptions, result.scores[c.id], audio) : c) }));
            setEmphasisEnabled(true); announce('Emphasis applied. Every word remains editable.');
        } catch(e) { if (ctrl.signal.aborted) announce('Emphasis canceled.'); else fail(e); }
        finally { setEmphasisBusy(''); abortRef.current = null; }
    }
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
    useEffect(() => { const test = document.createElement('canvas').getContext('2d')!; test.font = '72px monospace'; const fallback = test.measureText('Winter is coming MWiw').width; test.font = '72px "Gill Sans MT", monospace'; setFontReady(Math.abs(test.measureText('Winter is coming MWiw').width - fallback) > .1); }, [fontTick]);
    useEffect(() => { if (!notice)
        return; const id = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(id); }, [notice]);
    useEffect(() => { let frame = 0, last = performance.now(), lastUpdate = 0; const tick = (now: number) => { const delta = (now - last) / 1000; last = now; if (playingRef.current) {
        const t = asset && video.current && !video.current.ended ? video.current.currentTime : timeRef.current + delta;
        for (const a of [vocalAudio.current, instrumentalAudio.current]) if (a && a.readyState >= 2 && !a.ended && Math.abs(a.currentTime - t) > .12) a.currentTime = t;
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
    useEffect(() => {
        for (const [key, element] of [['original', video.current], ['vocals', vocalAudio.current], ['instrumental', instrumentalAudio.current]] as const) {
            if (!element) continue;
            element.muted = muted; element.volume = trackGain(mixer, key, availableTracks);
            if (playing && (key === 'original' ? !!asset : availableTracks.includes(key))) { element.currentTime = timeRef.current; void element.play().catch(e => { setPlaying(false); fail(e); }); }
            else element.pause();
        }
    }, [playing, muted, asset?.url, stems?.vocals?.url, stems?.instrumental?.url]);
    useEffect(() => {
        for (const [key, element] of [['original', video.current], ['vocals', vocalAudio.current], ['instrumental', instrumentalAudio.current]] as const) if (element) { element.muted = muted; element.volume = trackGain(mixer, key, availableTracks); }
    }, [mixer, muted, stems, asset]);
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
            if (stems.vocals) URL.revokeObjectURL(stems.vocals.url);
            if (stems.instrumental) URL.revokeObjectURL(stems.instrumental.url);
        }
        setAsset(next);
        setProject(p => ({ ...p, mixer: structuredClone(defaultMixer) }));
        setStems(null);

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
        if (stems) { if (stems.vocals) URL.revokeObjectURL(stems.vocals.url); if (stems.instrumental) URL.revokeObjectURL(stems.instrumental.url); }
        assetGeneration.current++;
        setAsset(null);
        setStems(null);

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
        const family = fontFamilyInput.trim().replace(/[\"\\]/g, '').slice(0, 100);
        if (!family) throw new Error('Enter a font family name.');
        const face = new FontFace(family, data, { weight: fontVariant.includes('bold') ? '700' : '400', style: fontVariant.includes('italic') ? 'italic' : 'normal' });
        await face.load();
        document.fonts.add(face);
        registerLoadedFont(family);
        setCustomFonts(fonts => [...new Set([...fonts, family])]);
        if (selection.length || scopeAll) patchCaptions({ font: family });
        setFontTick(t => t + 1);
        announce(`${fontVariant} font loaded for this session.`);
    }
    catch {
        fail('This font could not be loaded. Choose a valid TTF, OTF, WOFF or WOFF2 file and enter a family name.');
    } }
    function canvasDrag(e: React.PointerEvent, id: string, resize = false) {
        if (e.button !== 0) return;
        if (editing === id && !resize && !(e.target as HTMLElement).closest('.drag-grip')) return;
        e.stopPropagation(); e.preventDefault(); setPlaying(false); setEditing(null);
        if (e.shiftKey || e.ctrlKey || e.metaKey) { select(id, true); return; }
        const ids = selection.includes(id) ? selection : multiSelectMode ? [...selection,id] : [id]; setSelection(ids); setSelectedWords([]); checkpoint();
        const start = structuredClone(projectRef.current), rect = shell.current!.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
        const ctx = canvas.current!.getContext('2d')!, anchor = start.captions.find(c => c.id === id)!, box = layoutCaption(ctx, anchor), origin = captionOrigin(anchor, box);
        seek(anchor.start);
        const moving = start.captions.filter(c => ids.includes(c.id)).map(c => { const b = layoutCaption(ctx, c); return { c, b, o: captionOrigin(c, b) }; });
        const move = (ev: PointerEvent) => {
            let dx = (ev.clientX - sx) / rect.width * 1920, dy = (ev.clientY - sy) / rect.height * 1080;
            const factor = Math.max(.05, 1 + (anchor.anchor === 'center' ? 2 : 1) * (dx * box.width + dy * box.height) / (box.width ** 2 + box.height ** 2));
            if (!resize) {
                const nx = snap(origin.x + box.width / 2 + dx, [960], 8 / rect.width * 1920);
                const ny = snap(origin.y + box.height / 2 + dy, [540], 8 / rect.height * 1080);
                dx = nx.value - origin.x - box.width / 2; dy = ny.value - origin.y - box.height / 2;
                dx = clamp(dx, -Math.min(...moving.map(m => m.o.x)), Math.max(0, 1920 - Math.max(...moving.map(m => m.o.x + m.b.width))));
                dy = clamp(dy, -Math.min(...moving.map(m => m.o.y)), Math.max(0, 1080 - Math.max(...moving.map(m => m.o.y + m.b.height))));
                setCanvasGuides({ x: nx.target !== null, y: ny.target !== null });
            }
            setProject({ ...start, captions: start.captions.map(c => !ids.includes(c.id) ? c : resize ? scaleCaption(c, factor) : { ...c, x: c.x + dx / 19.2, y: c.y + dy / 10.8 }) });
        };
        const done = () => { setCanvasGuides({ x: false, y: false }); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', done); window.removeEventListener('pointercancel', done); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', done, { once: true }); window.addEventListener('pointercancel', done, { once: true });
    }
    function timelineDrag(e: React.PointerEvent, c: Caption, edge?: 'start' | 'end') {
        if (e.button !== 0) return; e.stopPropagation(); e.preventDefault();
        const previousTime = timeRef.current; setPlaying(false); seek(c.start);
        if (e.shiftKey || e.ctrlKey || e.metaKey) { select(c.id, true, false); return; }
        const wasSelected = selection.includes(c.id); const ids = wasSelected ? selection : multiSelectMode ? [...selection,c.id] : [c.id]; setSelection(ids); setEditing(null); setSelectedWords([]);
        const lane = e.currentTarget.closest('.timeline-content')!.getBoundingClientRect(), sx = e.clientX, start = structuredClone(projectRef.current);
        const moving = start.captions.filter(c => ids.includes(c.id));
        const points = [...timeBoundaries(start.captions, ids), previousTime, 0, start.duration];
        const edges = moving.flatMap(c => edge ? [c[edge]] : [c.start, c.end]);
        let moved = false;
        const move = (ev: PointerEvent) => {
            if (Math.abs(ev.clientX - sx) < 3 && !moved) return;
            if (!moved) { checkpoint(); moved = true; }
            const result = snapGroup((ev.clientX - sx) / lane.width * start.duration, edges, points, 8 / lane.width * start.duration);
            const min = edge === 'end' ? Math.max(...moving.map(c => c.start + .05 - c.end)) : -Math.min(...moving.map(c => c.start));
            const max = edge === 'start' ? Math.min(...moving.map(c => c.end - .05 - c.start)) : start.duration - Math.max(...moving.map(c => c.end));
            const delta = clamp(result.delta, min, max);
            setTimelineGuide(delta === result.delta ? result.target : null);
            setProject({ ...start, captions: start.captions.map(item => !ids.includes(item.id) ? item : edge ? { ...item, [edge]: item[edge] + delta } : shiftCaption(item, delta)) });
            seek(c.start + (edge === 'end' ? 0 : delta));
        };
        const done = () => { if (!moved && multiSelectMode && wasSelected) setSelection(ids.filter(id=>id!==c.id)); setTimelineGuide(null); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', done); window.removeEventListener('pointercancel', done); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', done, { once: true }); window.addEventListener('pointercancel', done, { once: true });
    }
    function scrub(e: React.PointerEvent) {
        e.preventDefault(); e.stopPropagation(); setPlaying(false); setEditing(null); setSelectedWords([]);
        const lane = e.currentTarget.closest('.timeline-content')!.getBoundingClientRect();
        const move = (ev: { clientX: number }) => {
            const p = projectRef.current;
            const result = snap(clamp((ev.clientX - lane.left) / lane.width * p.duration, 0, p.duration), p.captions.flatMap(c => [c.start, c.end]), 8 / lane.width * p.duration);
            seek(result.value); setTimelineGuide(result.target);
            setSelection(p.captions.filter(c => result.value >= c.start && result.value < c.end).map(c => c.id));
        };
        const done = () => { setTimelineGuide(null); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', done); window.removeEventListener('pointercancel', done); };
        move(e); window.addEventListener('pointermove', move); window.addEventListener('pointerup', done, { once: true }); window.addEventListener('pointercancel', done, { once: true });
    }
    function openMenu(e: React.MouseEvent, kind: ContextTarget['kind'], id?: string, track?: TrackName) {
        e.preventDefault(); e.stopPropagation(); setPlaying(false);
        if (id) {
            if (!selection.includes(id)) { setSelection([id]); setSelectedWords([]); setEditing(null); }
            else setSelection([id, ...selection.filter(x => x !== id)]);
            setScopeAll(false);
        }
        const lane = (e.currentTarget as HTMLElement).closest('.timeline-content')?.getBoundingClientRect();
        const at = lane ? clamp((e.clientX-lane.left)/lane.width*project.duration,0,project.duration) : current;
        setMenu({ kind, id, track, x:e.clientX, y:e.clientY, time:at });
    }
    function timelineMarquee(e: React.PointerEvent) {
        if (e.button !== 0 || (e.target as HTMLElement).closest('.caption-clip,.ruler,.playhead,button')) return;
        e.preventDefault(); setPlaying(false); setEditing(null); setSelectedWords([]);
        const node = e.currentTarget as HTMLElement, rect = node.getBoundingClientRect(), sx = e.clientX-rect.left, sy=e.clientY-rect.top;
        const previous = e.shiftKey || e.ctrlKey || e.metaKey || multiSelectMode ? selection : [];
        let moved=false;
        const move = (ev: PointerEvent) => {
            const r=node.getBoundingClientRect(), x=clamp(ev.clientX-r.left,0,r.width), y=clamp(ev.clientY-r.top,0,r.height);
            if(!moved && Math.hypot(x-sx,y-sy)<3) return; moved=true;
            const box={left:Math.min(sx,x),top:Math.min(sy,y),width:Math.abs(x-sx),height:Math.abs(y-sy)};setMarquee(box);
            const track=node.querySelector('.caption-track')!.getBoundingClientRect();
            const ids = box.top+box.height >= track.top-r.top && box.top <= track.bottom-r.top ? marqueeIds(projectRef.current.captions,sx/r.width*projectRef.current.duration,x/r.width*projectRef.current.duration) : [];
            setSelection([...new Set([...previous,...ids])]);
        };
        const done=()=>{setMarquee(null);if(!moved) {const t=clamp(sx/rect.width*projectRef.current.duration,0,projectRef.current.duration);seek(t);setSelection(projectRef.current.captions.filter(c=>t>=c.start&&t<c.end).map(c=>c.id));}window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',done);window.removeEventListener('pointercancel',done);};
        window.addEventListener('pointermove',move);window.addEventListener('pointerup',done,{once:true});window.addEventListener('pointercancel',done,{once:true});
    }
    function editSelected() {
        if(selection.length>1) setBulkText(Object.fromEntries(project.captions.filter(c=>selection.includes(c.id)).map(c=>[c.id,plain(c)])));
        else if(chosen) { seek(chosen.start); setEditing(chosen.id); checkpoint(); setTimeout(()=>wordEditor.current?.focus(),0); }
    }
    function pasteCaptions(at: number) {
        const source=copiedCaptions.current;if(!source.length)return;
        const min=Math.min(...source.map(c=>c.start));const pasted=source.map(c=>({...shiftCaption(structuredClone(c),at-min),id:uid()}));
        commit(p=>({...p,duration:Math.max(p.duration,...pasted.map(c=>c.end)),captions:[...p.captions,...pasted]}));setSelection(pasted.map(c=>c.id));seek(at);
    }
    function addAt(at: number) { const c=caption('Your words here',Math.min(at,project.duration-.1),Math.min(at+3,project.duration));commit(p=>({...p,captions:[...p.captions,c]}));setSelection([c.id]);seek(c.start); }
    function splitSelected(at: number) { const ids:string[]=[];const captions=projectRef.current.captions.flatMap(c=>{if(!selection.includes(c.id))return[c];const parts=splitCaption(c,at);ids.push(...parts.map(c=>c.id));return parts;});commit(p=>({...p,captions}));setSelection(ids);setEditing(null); }
    function showAnimations() { setTimeout(()=>{const panel=document.querySelector<HTMLDetailsElement>('.motion-panel');if(panel){panel.open=true;panel.scrollIntoView({block:'nearest',behavior:'smooth'});}},0); }
    function removeStem(key: 'vocals' | 'instrumental') { const old=stems?.[key];if(old) URL.revokeObjectURL(old.url);setStems(s=>{const next={...s};delete next[key];return next;});setMixerTrack(key,{solo:false,muted:true}); }
    function captureWords() { const range = window.getSelection(); if (!range || range.isCollapsed || !wordEditor.current) {
        setSelectedWords([]);
        return;
    } const r = range.getRangeAt(0); const found = Array.from(wordEditor.current.querySelectorAll('[data-word]')).filter(n => r.intersectsNode(n)).map(n => Number(n.getAttribute('data-word'))); setSelectedWords(found); }
    function centerCaptions() { patchCaptions({ anchor: 'center', x: 50, y: 50, align: 'center' }); }
    const reset = () => commit(p => ({ ...p, captions: p.captions.map(c => selection.includes(c.id) ? { ...c, scale: 1, spacing: 0, lineHeight: 1.2, baseSize: 90, baseColor: '#ffffff', words: c.words.map(w => manualStyle(w, baseStyle)) } : c) }));
    function openTranscription() { setSetup({ rules: { ...rules, limitBy: rules.limitBy === 'characters' ? 'characters' : 'words' }, emphasis: emphasisEnabled, level: emphasisOptions.level }); setAiMode(stems?.vocals ? 'transcribe' : 'both'); setAiOpen(true); }
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
        let vocals = stems?.vocals?.file;
        try {
            if (aiMode !== 'transcribe') {
                setBusy('Preparing audio on your device…');
                const [left, right] = await decodePcm(asset.file, 44100, 2, ctrl.signal);
                const result = await runLocalAI({ kind: 'separate', left, right }, ctrl.signal, setBusy);
                if (result.kind !== 'separate') throw new Error('Unexpected separation result.');
                setBusy('Preparing your vocal and instrumental tracks…');
                const v = wavBlob(result.vocals), i = wavBlob(result.instrumental);
                const make = async (file: Blob, name: string): Promise<Asset> => ({ file, url: URL.createObjectURL(file), name, hasVideo: false, hasAudio: true, duration: asset.duration, peaks: await waveform(file) });
                const [vocalAsset, instrumentalAsset] = await Promise.all([make(v, 'Vocals.wav'), make(i, 'Instrumental.wav')]);
                ctrl.signal.throwIfAborted();
                if (stems) {
                    if (stems.vocals) URL.revokeObjectURL(stems.vocals.url);
                    if (stems.instrumental) URL.revokeObjectURL(stems.instrumental.url);
                }
                setStems({ vocals: vocalAsset, instrumental: instrumentalAsset });
                vocals = v;
            }
            if (aiMode !== 'separate') {
                setBusy(vocals ? 'Transcribing isolated vocals…' : 'Transcribing original audio…');
                const [audio] = await decodePcm(vocals ?? asset.file, 16000, 1, ctrl.signal);
                const result = await runLocalAI({ kind: 'transcribe', audio, language }, ctrl.signal, setBusy);
                if (result.kind !== 'transcribe') throw new Error('Unexpected transcription result.');
                const words = result.words;
                let cs = groupWords(words.map(w => ({ ...baseStyle, text: w.word, start: w.start, end: w.end })), setup.rules).map(c => ({ ...c, review: true }));
                if (!cs.length)
                    throw new Error('No words were detected. Try the original audio or another language.');
                if (setup.emphasis) {
                    setBusy('Choosing meaningful emphasis…');
                    const meaning = await runLocalAI({ kind: 'emphasis', captions: cs.map(c => ({ id: c.id, text: plain(c), candidates: emphasisCandidates(c) })) }, ctrl.signal, setBusy);
                    if (meaning.kind !== 'emphasis') throw new Error('Unexpected emphasis result.');
                    cs = cs.map(c => emphasize(c, { ...emphasisOptions, level: setup.level }, meaning.scores[c.id], vocals ? audio : undefined) as typeof c);
                }
                ctrl.signal.throwIfAborted();
                setEmphasisEnabled(setup.emphasis); setEmphasisOptions(o => ({ ...o, level: setup.level }));
                commit(p => ({ ...p, captionRules: setup.rules, captions: cs, duration: Math.max(p.duration, ...cs.map(c => c.end)) }));
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
    function cancelProcessing() { abortRef.current?.abort(); }
    async function doExport() { setError(''); setPlaying(false); setEditing(null); setProgress(0); const ctrl = new AbortController(); abortRef.current = ctrl; try {
        const audio = exportAudio === 'mixer' ? await mixAudio(availableTracks.map(key => ({ file: key === 'original' ? asset!.file : stems![key]!.file, gain: muted ? 0 : trackGain(mixer, key, availableTracks) })), project.duration, ctrl.signal) : exportAudio === 'none' ? null : exportAudio === 'original' ? asset?.file ?? null : stems?.[exportAudio as 'vocals' | 'instrumental']?.file ?? null;
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
    const renderedBoxes = (() => { const ctx = canvas.current?.getContext('2d'); return active.map(c => ({ c, layout: ctx ? layoutCaption(ctx, c) : { width: 500, height: 120, lines: [] } })); })();
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
 <video aria-hidden="true" ref={video} src={asset?.url} preload="auto" playsInline className="source-media" onError={() => fail('This file cannot play in your browser. Try an H.264 MP4, MP3 or WAV.')} onEnded={() => { if (asset && asset.duration >= project.duration - .05) { setPlaying(false); seek(projectRef.current.duration); } }}/>
 <audio aria-hidden="true" ref={vocalAudio} src={stems?.vocals?.url} preload="auto"/><audio aria-hidden="true" ref={instrumentalAudio} src={stems?.instrumental?.url} preload="auto"/>
 <header className="topbar"><div className="brand"><span className="brandmark">v</span>verse<span className="beta">STUDIO</span></div><DropdownMenu><DropdownMenuTrigger className="project-name">{project.name}<ChevronDown size={14}/><span className="muted">{sample ? 'Typography sample' : saved ? 'Project saved' : 'Unsaved edits'}</span></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onSelect={save}><Save size={15}/> Save project</DropdownMenuItem><DropdownMenuItem onSelect={() => projectInput.current?.click()}><FolderOpen size={15}/> Open project</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => subtitleInput.current?.click()}><Upload size={15}/> Import subtitles</DropdownMenuItem><DropdownMenuItem onSelect={() => download(new Blob([toSrt(project.captions)], { type: 'text/plain' }), 'captions.srt')}><Download size={15}/> Download SRT</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => setAiOpen(true)}><Settings2 size={15}/> On-device AI</DropdownMenuItem></DropdownMenuContent></DropdownMenu><div className="header-actions"><IconButton label="Import media" className="header-icon" onClick={() => mediaInput.current?.click()} disabled={!!busy}><Upload size={17}/></IconButton><button className="primary" onClick={() => { setFilename(project.name.toLowerCase().replace(/\s+/g, '-')); setExportOpen(true); }} disabled={!!busy}><Download size={16}/> Export video <ArrowUpRight size={15}/></button></div></header>
 <div className="workarea"><aside className="left-panel"><Tabs value={tab} onValueChange={setTab}><TabsList className="panel-tabs"><TabsTrigger value="media">Media</TabsTrigger><TabsTrigger value="transcript">Transcript</TabsTrigger></TabsList><TabsContent value="media"><button className="upload-area" onClick={() => mediaInput.current?.click()} disabled={!!busy}><Upload size={23}/><strong>{asset ? 'Replace or relink media' : 'Bring your story in'}</strong><span>Drop a video or audio file</span><small>MP4, MOV, MP3, WAV · up to 12 min</small></button>{asset && <div className="asset-card"><div className="asset-icon">{asset.hasVideo ? <Film size={22}/> : <AudioLines size={22}/>}</div><div><strong title={asset.name}>{asset.name}</strong><small>{time(asset.duration)} · {(asset.file.size / 1024 / 1024).toFixed(1)} MB</small></div><Check size={14}/></div>}<MixerPanel mixer={mixer} available={availableTracks} onChange={setMixerTrack} onContext={(e,key)=>openMenu(e,'audio',undefined,key)} onDownload={key => { if(stems?.[key]) download(stems[key]!.file, key + '.wav'); }}/><button className="ai-button full" onClick={() => { setAiMode('separate'); setAiOpen(true); }} disabled={!asset?.hasAudio || !!busy}><Sparkles size={16}/> Separate vocals</button><div className="tip"><Info size={16}/><p>Listen to isolated vocals for cleaner transcription. Your original audio stays available for export.</p></div></TabsContent><TabsContent value="transcript"><div className="panel-heading"><h2>Every word, in place.</h2><p>{sample ? 'A little inspiration. Make it yours.' : 'Edit a line to shape your story.'}</p></div><button className="ai-button" onClick={openTranscription} disabled={!!busy}><Sparkles size={16}/> Transcribe</button><div className="section-label">CAPTIONS <span>{String(project.captions.length).padStart(2, '0')}</span></div><div className="transcript-lines">{[...project.captions].sort((a, b) => a.start - b.start).map((c, i) => <div key={c.id} data-caption-id={c.id} onContextMenu={e=>openMenu(e,'caption',c.id)} className={'transcript-line ' + (selection.includes(c.id) ? 'selected' : '')} onClick={e => select(c.id, e.shiftKey || e.ctrlKey || e.metaKey)}><button className="line-number" aria-label={`Select caption ${i + 1}`}>{String(i + 1).padStart(2, '0')}</button><div><small>{time(c.start)} → {time(c.end)}</small><textarea aria-label={`Caption ${i + 1} text`} value={plain(c)} rows={Math.max(1, Math.ceil(plain(c).length / 22))} onClick={e => { e.stopPropagation(); if (!selection.includes(c.id)) {
        setSelection([c.id]);
        seek(c.start);
    } setPlaying(false); }} onFocus={() => { checkpoint(); setEditing(null); setSelectedWords([]); }} onChange={e => editText(c.id, e.target.value, false)}/>{c.review && <button className="review-badge" onClick={e => { e.stopPropagation(); commit(p => ({ ...p, captions: p.captions.map(x => x.id === c.id ? { ...x, review: false } : x) })); }}>Check wording · mark reviewed</button>}</div></div>)}</div>{!project.captions.length && <div className="empty-copy">Generate captions from your audio, import subtitles, or add your first line.</div>}<button className="quiet full" onClick={add}><Plus size={16}/> Add caption</button><button className="text-button full" onClick={() => subtitleInput.current?.click()}>Import SRT / VTT</button><div className="tip"><MousePointer2 size={17}/><p>Select words on the canvas to give them their own voice.</p></div></TabsContent></Tabs></aside>
 <section className="center-panel"><div className="canvas-toolbar"><span><MousePointer2 size={15}/> Canvas {sample && <span className="sample-label">SAMPLE</span>}</span><span className="muted">16:9 <IconButton label="Fullscreen canvas" onClick={() => { if (document.fullscreenElement)
        void document.exitFullscreen();
    else
        void shell.current?.requestFullscreen().catch(fail); }}><Maximize2 size={14}/></IconButton></span></div><div className="canvas-zoom"><span>View</span><input aria-label="Canvas zoom" type="range" min={5} max={200} value={Math.round((canvasZoom ?? fitScale)*100)} onChange={e=>setCanvasZoom(+e.target.value/100)}/><output>{Math.round((canvasZoom ?? fitScale)*100)}%</output><button onClick={()=>setCanvasZoom(null)}>Fit to screen</button><button onClick={()=>setCanvasZoom(1)}>100% view</button></div><div className="stage" ref={viewport} onClick={() => { setSelection([]); setSelectedWords([]); setEditing(null); }}><div className="canvas-view"><div ref={shell} className="preview-shell" style={{ background: project.background }}><canvas ref={canvas} width={1920} height={1080} aria-label="Live caption and video preview"/>{canvasGuides.x && <div className="canvas-guide vertical"/>}{canvasGuides.y && <div className="canvas-guide horizontal"/>}{canvasGuides.x && canvasGuides.y && <div className="center-guide-dot"/>}{renderedBoxes.map(({ c, layout }) => <div key={c.id} className={'caption-overlay ' + (selection.includes(c.id) ? 'is-selected' : '') + (editing === c.id ? ' is-editing' : '')} style={{ left: `${captionOrigin(c, layout).x / 19.2}%`, top: `${captionOrigin(c, layout).y / 10.8}%`, visibility: playing ? 'hidden' : 'visible', width: `${layout.width / 19.2}%`, height: `${layout.height / 10.8}%` }} onClick={e => e.stopPropagation()} onContextMenu={e=>openMenu(e,'canvas',c.id)} onPointerDown={e => canvasDrag(e, c.id)} onDoubleClick={() => { setSelection([c.id]); setPlaying(false); setEditing(c.id); checkpoint(); setTimeout(() => wordEditor.current?.focus(), 0); }}>{editing === c.id ? <CanvasText caption={c} layout={layout} editorRef={wordEditor} onText={text => editText(c.id, text, false)} onSelection={setSelectedWords}/> : null}{selection.includes(c.id) && <><span className="caption-name">{editing === c.id ? 'EDIT TEXT' : 'CAPTION'}</span><button className="drag-grip" aria-label="Drag caption" onPointerDown={e => { if (editing === c.id) {
        setEditing(null);
    } canvasDrag(e, c.id); }}><Grip size={13}/></button><button className="resize-handle" aria-label="Scale caption" onPointerDown={e => canvasDrag(e, c.id, true)}/></>}</div>)}</div></div></div><div className="transport"><span className="timecode">{time(current)}<span> / {time(project.duration)}</span></span><div className="transport-buttons"><IconButton label="Previous caption" onClick={() => navigate(-1)}><SkipBack size={16}/></IconButton><button className="play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => { setEditing(null); if (current >= project.duration)
        seek(0); setPlaying(p => !p); }}>{playing ? <Pause size={17} fill="currentColor"/> : <Play size={17} fill="currentColor"/>}</button><IconButton label="Next caption" onClick={() => navigate(1)}><SkipForward size={16}/></IconButton></div><IconButton label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(m => !m)}>{muted ? <VolumeX size={16}/> : <Volume2 size={16}/>}</IconButton></div><div className="canvas-hint">Double-click to edit text <span>·</span> Drag to reposition <span>·</span> Shift-click to select more</div>{!fontReady && active.some(c => c.font === 'Gill Sans MT') && <button className="font-notice" onClick={() => setFontOpen(true)}>Gill Sans MT isn’t available on this device. Load your font for an exact match.</button>}</section>
 <aside className="right-panel"><div className="properties-heading">{chosen ? <Type size={18}/> : <Settings2 size={18}/>}<h2>{selectedWords.length ? 'Word selection' : chosen ? 'Caption' : 'Project'}</h2>{chosen && <span className="badge">{selectedWords.length ? `${selectedWords.length} tokens` : `${selection.length} selected`}</span>}</div>{chosen ? <><CaptionControls c={chosen} count={selection.length} wordCount={selectedWords.length} style={styledWord} bold={allBold} italic={allItalic} both={allBold && allItalic} fonts={fontFamilies} preserve={preserveStyles} scopeAll={scopeAll} onScope={setScopeAll} onPreserve={setPreserveStyles} patch={patchCaptions} format={format} toggle={toggleFormat} all={applyAll} center={centerCaptions} upload={() => setFontOpen(true)}/>{selection.length > 1 && <button className="quiet full" onClick={editSelected}>Edit selected captions</button>}<MotionControls caption={chosen} patch={patchCaptions}/><section className="property-group"><label>Caption timing <span className="muted">seconds</span></label><div className="field-row"><NumberField label="In" value={chosen.start} min={0} max={chosen.end - .05} step={.01} onChange={v => changeTiming(chosen.id, 'start', v)}/><NumberField label="Out" value={chosen.end} min={chosen.start + .05} max={project.duration} step={.01} onChange={v => changeTiming(chosen.id, 'end', v)}/></div>{selectedWords.length === 1 && chosen.words[selectedWords[0]]?.start !== undefined && <><label>Selected word timing</label><div className="field-row"><NumberField label="Word in" value={chosen.words[selectedWords[0]].start!} min={chosen.start} max={chosen.words[selectedWords[0]].end! - .01} step={.01} onChange={v => commit(p => ({ ...p, captions: p.captions.map(c => c.id === chosen.id ? { ...c, words: c.words.map((w, i) => i === selectedWords[0] ? { ...w, start: v } : w) } : c) }))}/><NumberField label="Word out" value={chosen.words[selectedWords[0]].end!} min={chosen.words[selectedWords[0]].start! + .01} max={chosen.end} step={.01} onChange={v => commit(p => ({ ...p, captions: p.captions.map(c => c.id === chosen.id ? { ...c, words: c.words.map((w, i) => i === selectedWords[0] ? { ...w, end: v } : w) } : c) }))}/></div></>}</section><div className="secondary-actions"><IconButton label="Copy formatting" onClick={copyStyle}><Copy size={15}/></IconButton><IconButton label="Paste formatting" disabled={!copiedStyle.current} onClick={pasteStyle}><ClipboardPaste size={15}/></IconButton><IconButton label="Reset formatting" onClick={reset}><RotateCcw size={15}/></IconButton><IconButton label="Delete selected captions" onClick={remove}><Trash2 size={15}/></IconButton></div></> : <><section className="property-group"><label htmlFor="project-title">Project name</label><input id="project-title" value={project.name} onChange={e => commit(p => ({ ...p, name: e.target.value }))}/><NumberField label="Duration" value={project.duration} min={Math.max(.5, asset?.duration ?? 0, ...project.captions.map(c => c.end))} max={720} step={1} onChange={duration => commit(p => ({ ...p, duration }))}/><label>Canvas format</label><div className="readout">16:9 · Landscape</div></section><div className="empty-copy">Select a caption on the canvas or timeline to edit its typography.</div><button className="quiet full" onClick={() => setSelection(project.captions.map(c => c.id))}>Select all captions</button></>}<BreakControls rules={rules} onChange={patch => commit(p => ({ ...p, captionRules: { ...(p.captionRules ?? defaultRules), ...patch } }))} selected={selection.length > 0} onApply={reflow}/><EmphasisControls options={emphasisOptions} enabled={emphasisEnabled} selectedOnly={emphasisSelected} selectionCount={selection.length} busy={emphasisBusy} onOptions={patch => setEmphasisOptions(p => ({ ...p, ...patch }))} onEnabled={enabled => { if (enabled) void runEmphasis(); else removeEmphasis(); }} onSelectedOnly={setEmphasisSelected} onGenerate={() => void runEmphasis()} onRemove={removeEmphasis} onCancel={() => abortRef.current?.abort()}/><section className="property-group"><label>Canvas background</label><div className="color-field"><input aria-label="Canvas background color" type="color" value={project.background} onChange={e => commit(p => ({ ...p, background: e.target.value }))}/><span>{project.background.slice(1).toUpperCase()}</span><span className="muted">100%</span></div></section></aside></div>
 <section className="timeline"><div className="timeline-toolbar"><div><IconButton label="Undo (Ctrl Z)" onClick={undo} disabled={!undoStack.current.length}><Undo2 size={16}/></IconButton><IconButton label="Redo (Ctrl Shift Z)" onClick={redo} disabled={!redoStack.current.length}><Redo2 size={16}/></IconButton><span className="separator"/><IconButton label="Split at playhead" onClick={split} disabled={!chosen}><Scissors size={16}/></IconButton><IconButton label="Duplicate captions" onClick={duplicate} disabled={!chosen}><Copy size={16}/></IconButton><IconButton label="Merge selected captions" onClick={merge} disabled={selection.length < 2}><Merge size={16}/></IconButton><IconButton label="Delete captions" onClick={remove} disabled={!chosen}><Trash2 size={16}/></IconButton><IconButton label="Add caption" onClick={add}><Plus size={16}/></IconButton></div><button className={multiSelectMode ? 'multi-select-toggle active' : 'multi-select-toggle'} aria-pressed={multiSelectMode} onClick={()=>setMultiSelectMode(v=>!v)}>Select multiple</button><div className="zoom"><button aria-label="Zoom out" onClick={() => setZoom(z => Math.max(1, z - .5))}>−</button><input aria-label="Timeline zoom" type="range" min={1} max={6} step={.25} value={zoom} onChange={e => setZoom(+e.target.value)}/><button aria-label="Zoom in" onClick={() => setZoom(z => Math.min(6, z + .5))}>+</button></div></div><div className="track-grid"><div className="track-labels"><div /><div><Film size={15}/>{asset?.hasVideo ? 'Video' : 'Original'}</div><div><AudioLines size={15}/> Vocals</div><div><Music2 size={15}/> Instrumental</div><div><Type size={15}/> Captions</div></div><div className="timeline-scroll"><div className="timeline-content" onPointerDown={timelineMarquee} onContextMenu={e=>openMenu(e,'empty')} style={{ width: `${zoom * 100}%` }}><div className="ruler" onPointerDown={scrub}>{Array.from({ length: Math.ceil(zoom * 6) + 1 }, (_, i) => <span key={i}>{time(i * project.duration / (Math.ceil(zoom * 6))).slice(0, 5)}</span>)}</div><div className="empty-track original-track" onContextMenu={e=>openMenu(e,'audio',undefined,'original')}>{asset ? <><Wave peaks={asset.peaks} color="#83b9c5"/><span className="track-name">{mixer.original.name || asset.name}</span></> : <button onClick={() => mediaInput.current?.click()}><Upload size={13}/> Import media to add your video and audio tracks</button>}</div><div className="empty-track vocals-track" onContextMenu={e=>openMenu(e,'audio',undefined,'vocals')}>{stems?.vocals ? <><Wave peaks={stems.vocals.peaks} color="#ad9eda"/><span className="track-name">{mixer.vocals.name || 'Vocals'}</span></> : <span>Vocals appear after separation</span>}</div><div className="empty-track instrumental-track" onContextMenu={e=>openMenu(e,'audio',undefined,'instrumental')}>{stems?.instrumental ? <><Wave peaks={stems.instrumental.peaks} color="#83adb2"/><span className="track-name">{mixer.instrumental.name || 'Instrumental'}</span></> : <span>Instrumental appears after separation</span>}</div>{marquee && <div className="timeline-marquee" style={marquee}/>}<div className="caption-track">{project.captions.map(c => <div role="button" tabIndex={0} aria-label={`Timeline caption: ${plain(c)}`} key={c.id} onKeyDown={e => { if (e.key === 'Enter')
        select(c.id, e.shiftKey || e.ctrlKey || e.metaKey || multiSelectMode); }} onContextMenu={e=>openMenu(e,'caption',c.id)} onPointerDown={e => timelineDrag(e, c)} className={'caption-clip ' + (selection.includes(c.id) ? 'active' : '')} style={{ left: `${c.start / project.duration * 100}%`, width: `${(c.end - c.start) / project.duration * 100}%` }}><span className="timing-handle start" role="slider" tabIndex={0} aria-label={`Start time of ${plain(c)}`} aria-valuemin={0} aria-valuemax={c.end} aria-valuenow={c.start} onPointerDown={e => timelineDrag(e, c, 'start')} onKeyDown={e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.stopPropagation();
        e.preventDefault();
        changeTiming(c.id, 'start', c.start + (e.key === 'ArrowRight' ? .1 : -.1));
    } }}/><Type size={13}/><span>{plain(c)}</span><span className="timing-handle end" role="slider" tabIndex={0} aria-label={`End time of ${plain(c)}`} aria-valuemin={c.start} aria-valuemax={project.duration} aria-valuenow={c.end} onPointerDown={e => timelineDrag(e, c, 'end')} onKeyDown={e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.stopPropagation();
        e.preventDefault();
        changeTiming(c.id, 'end', c.end + (e.key === 'ArrowRight' ? .1 : -.1));
    } }}/></div>)}</div><div role="slider" tabIndex={0} aria-label="Playhead" aria-valuemin={0} aria-valuemax={project.duration} aria-valuenow={current} onPointerDown={scrub} onKeyDown={e => { if(e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setPlaying(false); const t = clamp(current + (e.key === 'ArrowRight' ? .1 : -.1),0,project.duration); seek(t); setSelection(project.captions.filter(c => t >= c.start && t < c.end).map(c => c.id)); } }} className="playhead" style={{ left: `${current / project.duration * 100}%` }}/>{timelineGuide !== null && <div className="timeline-guide" style={{ left: `${timelineGuide / project.duration * 100}%` }}><span>{time(timelineGuide)}</span></div>}</div></div></div></section>
 <footer className="statusbar"><span>{busy ? <><LoaderCircle className="spin" size={12}/> {busy}</> : saved ? <><Check size={12}/> Project saved</> : <>Edits stay on this device · <button onClick={save}>Save project</button></>}</span><span>{chosen?.font ?? 'Inter Variable'} · 1920 × 1080 <span className="footer-brand">MADE TO BE HEARD.</span></span></footer>
 {(notice || error) && <div className={'toast ' + (error ? 'error' : '')} role={error ? 'alert' : 'status'}>{error ? <Info size={17}/> : <Check size={17}/>}<span>{error || notice}</span><button aria-label="Dismiss message" onClick={() => { setError(''); setNotice(''); }}><X size={15}/></button></div>}
 <Dialog open={aiOpen} onOpenChange={v => { if (!busy)
        setAiOpen(v); }}><DialogContent className="editor-dialog"><div className="dialog-emblem"><Sparkles size={23}/></div><DialogTitle>{aiMode === 'separate' ? 'Separate your audio' : 'Set up your captions'}</DialogTitle><DialogDescription>Separate vocals and create timed captions, right on your device.</DialogDescription>{!asset ? <button className="upload-area" onClick={() => { setAiOpen(false); mediaInput.current?.click(); }}><Upload /><strong>Upload your video or audio first</strong></button> : <><label>Workflow<select value={aiMode} disabled={!!busy} onChange={e => setAiMode(e.target.value)}><option value="both">Separate vocals → transcribe → captions</option><option value="separate">Separate vocals and instrumental only</option><option value="transcribe">Transcribe {stems ? 'isolated vocals' : 'original audio'}</option></select></label>{aiMode !== 'separate' && <><label>Language<select value={language} disabled={!!busy} onChange={e => setLanguage(e.target.value)}><option value="">Detect automatically</option>{[['en', 'English'], ['ne', 'Nepali'], ['hi', 'Hindi'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['ja', 'Japanese'], ['ko', 'Korean'], ['pt', 'Portuguese'], ['ar', 'Arabic']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label></>}{aiMode !== 'separate' && <CaptionSetupControls value={setup} disabled={!!busy} onChange={setSetup}/>}<div className="dialog-note"><strong>Private by design.</strong> Models download from Hugging Face on first use and are cached when browser storage is available. Your audio is processed on this device. No API key or processing fees. Allow about 350 MB for models and runtime files; separation needs a capable desktop and can take several minutes. Keep this tab open. {aiMode !== 'separate' && 'Generated captions replace the transcript; Undo restores it.'}</div>{busy ? <div className="processing"><LoaderCircle className="spin" size={18}/><span>{busy}</span><button className="quiet" onClick={() => void cancelProcessing()}>Cancel</button></div> : <button className="primary" disabled={!asset.hasAudio} onClick={() => void runAI()}><Sparkles size={16}/>{aiMode === 'separate' ? 'Separate on this device' : 'Transcribe with these settings'}</button>}</>}{error && <p className="inline-error" role="alert">{error}</p>}</DialogContent></Dialog>
 <Dialog open={fontOpen} onOpenChange={setFontOpen}><DialogContent className="editor-dialog"><DialogTitle>Your typography, exactly.</DialogTitle><DialogDescription>Use a built-in font or load your own family. Add each available variant under the same family name. Fonts stay on this device and work in preview and export.</DialogDescription><label>Font family name<input aria-label="Custom font family name" value={fontFamilyInput} onChange={e => setFontFamilyInput(e.target.value)} placeholder="e.g. My Display Font"/></label><label>Font variant<select aria-label="Font variant" value={fontVariant} onChange={e => setFontVariant(e.target.value)}><option value="regular">Regular</option><option value="bold">Bold</option><option value="italic">Italic</option><option value="bold italic">Bold Italic</option></select></label><button className="primary" onClick={() => fontInput.current?.click()}><Upload size={16}/> Choose font file</button><div className="dialog-note">TTF, OTF, WOFF and WOFF2 are supported. Inter, Lora and Montserrat are included with regular, bold and italic styles. Reload custom files when reopening the app.</div></DialogContent></Dialog>
 <Dialog open={exportOpen} onOpenChange={v => { if (progress === null)
        setExportOpen(v); }}><DialogContent className="editor-dialog"><div className="dialog-emblem"><Film size={23}/></div><DialogTitle>Ready for the final cut.</DialogTitle><DialogDescription>Your captions, styling, and timing are burned directly into the video.</DialogDescription><label>Filename<div className="filename-field"><input aria-label="Export filename" disabled={progress !== null} value={filename} onChange={e => setFilename(e.target.value)}/><span>.mp4</span></div></label><div className="field-row"><label>Resolution<select value={resolution} disabled={progress !== null} onChange={e => setResolution(+e.target.value)}><option value={1080}>1080p · Full HD</option><option value={2160}>4K · Ultra HD</option></select></label><label>Frame rate<select value={fps} disabled={progress !== null} onChange={e => setFps(+e.target.value)}><option value={30}>30 FPS</option><option value={60}>60 FPS</option></select></label></div><label>Audio<select value={exportAudio} disabled={progress !== null} onChange={e => setExportAudio(e.target.value)}><option value="mixer">Current mixer · mute, solo & volume</option><option value="original">Original audio only</option><option value="vocals" disabled={!stems?.vocals}>Vocals only</option><option value="instrumental" disabled={!stems?.instrumental}>Instrumental only</option><option value="none">No audio</option></select></label>{exportResult && <div className="export-result"><video controls src={exportResult.url} aria-label="Rendered MP4 preview"/><a className="quiet full" download={`${filename}.mp4`} href={exportResult.url}><Download size={15}/> Download rendered MP4 · {(exportResult.size / 1024 / 1024).toFixed(1)} MB</a></div>}<div className="export-summary"><span>MP4 · H.264 + AAC</span><span>{time(project.duration)} · {project.captions.length} captions</span></div>{!fontReady && project.captions.some(c => c.font === 'Gill Sans MT') && <p className="dialog-note">Gill Sans MT is unavailable. Your export will match the fallback font shown in the preview. Load your font for an exact Gill Sans match.</p>}<p className="dialog-note">Video is rendered locally at high quality; audio is encoded at 256 kbps. Keep this tab open. 4K / 60 FPS needs a capable device and browser.</p>{progress !== null ? <><progress value={progress} max={1}/><div className="processing"><span>{Math.round(progress * 100)}% rendered</span><button className="quiet" onClick={() => abortRef.current?.abort()}>Cancel export</button></div></> : <button className="primary" onClick={() => void doExport()}><Download size={16}/> Export MP4 <ArrowUpRight size={16}/></button>}{error && <p className="inline-error" role="alert">{error}</p>}</DialogContent></Dialog>
 {menu && <EditorContextMenu target={menu} close={()=>setMenu(null)}>
   <div className="context-title">{menu.kind === 'audio' ? (mixer[menu.track!].name || menu.track) : menu.kind === 'empty' ? 'Timeline' : `${selection.length} caption${selection.length === 1 ? '' : 's'}`}</div>
   {(menu.kind === 'caption' || menu.kind === 'canvas') && chosen && <>
     <MenuAction onClick={()=>{setMenu(null);editSelected();}}>{selection.length>1 ? 'Edit selected captions' : menu.kind === 'canvas' ? 'Edit text' : 'Edit'}</MenuAction>
     <MenuAction disabled={!project.captions.some(c=>selection.includes(c.id)&&menu.time!>c.start+.05&&menu.time!<c.end-.05)} onClick={()=>{splitSelected(menu.time!);setMenu(null);}}>Split at clicked time</MenuAction>
     <MenuAction onClick={()=>{copiedCaptions.current=structuredClone(project.captions.filter(c=>selection.includes(c.id)));setMenu(null);announce('Captions copied. Right-click the timeline to paste.');}}>Copy captions</MenuAction>
     <MenuAction onClick={()=>{duplicate();setMenu(null);}}>Duplicate</MenuAction>
     <MenuAction onClick={()=>{remove();setMenu(null);}}>Delete</MenuAction><hr/>
     {menu.kind === 'canvas' && <><div className="context-format">{(['bold','italic','both'] as const).map((k,i)=><button role="menuitemcheckbox" key={k} aria-checked={[allBold,allItalic,allBold&&allItalic][i]} onMouseDown={e=>e.preventDefault()} onClick={()=>toggleFormat(k)}>{['Bold','Italic','Bold Italic'][i]}</button>)}</div><label>Font<select aria-label="Context font" value={chosen.font} onChange={e=>patchCaptions({font:e.target.value})}>{fontFamilies.map(f=><option key={f}>{f}</option>)}</select></label><div className="context-fields"><NumberField label="Context size" value={styledWord.size} min={8} max={400} step={1} onChange={size=>format({size})}/><label>Color<input aria-label="Context color" type="color" value={styledWord.color} onChange={e=>format({color:e.target.value})}/></label></div><label>Alignment<select aria-label="Context alignment" value={chosen.align} onChange={e=>patchCaptions({align:e.target.value as Caption['align']})}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><hr/></>}
     <MenuAction onClick={()=>{copyStyle();setMenu(null);}}>Copy Style</MenuAction>
     <MenuAction disabled={!copiedStyle.current} onClick={()=>{pasteStyle();setMenu(null);}}>Paste Style</MenuAction>
     <MenuAction onClick={()=>{applyAll();setMenu(null);}}>Apply Style to All Captions</MenuAction>
     <MenuAction onClick={()=>{setMenu(null);showAnimations();}}>Animation</MenuAction><hr/>
     <MenuAction onClick={()=>{commit(p=>({...p,captions:reorderCaptions(p.captions,selection,'forward')}));setMenu(null);}}>Bring forward</MenuAction>
     <MenuAction onClick={()=>{commit(p=>({...p,captions:reorderCaptions(p.captions,selection,'back')}));setMenu(null);}}>Send backward</MenuAction>
     <MenuAction onClick={()=>{setMultiSelectMode(v=>!v);setMenu(null);}}>{multiSelectMode?'Finish selecting multiple':'Select multiple'}</MenuAction>
   </>}
   {menu.kind === 'audio' && menu.track && <>
     <MenuAction disabled={!availableTracks.includes(menu.track)} onClick={()=>{setMixerTrack(menu.track!,{muted:!mixer[menu.track!].muted});setMenu(null);}}>{mixer[menu.track].muted?'Unmute':'Mute'}</MenuAction>
     <MenuAction disabled={!availableTracks.includes(menu.track)} onClick={()=>{setMixerTrack(menu.track!,{solo:!mixer[menu.track!].solo,muted:false});setMenu(null);}}>{mixer[menu.track].solo?'Unsolo':'Solo'}</MenuAction>
     <label>Volume · {Math.round(mixer[menu.track].volume*100)}%<input aria-label="Context track volume" type="range" min={0} max={100} disabled={!availableTracks.includes(menu.track)} value={mixer[menu.track].volume*100} onChange={e=>setMixerTrack(menu.track!,{volume:+e.target.value/100})}/></label>
     <MenuAction disabled={!availableTracks.includes(menu.track)} onClick={()=>{setMixerTrack(menu.track!,{enabled:mixer[menu.track!].enabled===false});setMenu(null);}}>{mixer[menu.track].enabled===false?'Enable':'Disable'} track</MenuAction>
     <label>Rename<input aria-label="Track name" maxLength={80} value={mixer[menu.track].name ?? (menu.track==='original'?'Original audio':menu.track==='vocals'?'Vocals':'Instrumental')} onChange={e=>setMixerTrack(menu.track!,{name:e.target.value})}/></label>
     {menu.track !== 'original' && <MenuAction disabled={!availableTracks.includes(menu.track)} onClick={()=>{removeStem(menu.track as 'vocals'|'instrumental');setMenu(null);}}>Remove track</MenuAction>}
   </>}
   {menu.kind === 'empty' && <>
     <MenuAction disabled={!copiedCaptions.current.length} onClick={()=>{pasteCaptions(menu.time!);setMenu(null);}}>Paste captions here</MenuAction>
     <MenuAction onClick={()=>{addAt(menu.time!);setMenu(null);}}>Add caption here</MenuAction><hr/>
     <MenuAction onClick={()=>{setZoom(z=>Math.min(6,z+.5));setMenu(null);}}>Zoom timeline in</MenuAction>
     <MenuAction onClick={()=>{setZoom(z=>Math.max(1,z-.5));setMenu(null);}}>Zoom timeline out</MenuAction>
     <MenuAction onClick={()=>{setZoom(1);setMenu(null);}}>Fit timeline</MenuAction><hr/>
     <MenuAction onClick={()=>{seek(menu.time!);setMenu(null);}}>Jump playhead here</MenuAction>
     <MenuAction onClick={()=>{seek(0);setMenu(null);}}>Jump to start</MenuAction>
     <MenuAction onClick={()=>{seek(project.duration);setMenu(null);}}>Jump to end</MenuAction>
     <MenuAction onClick={()=>{navigate(-1);setMenu(null);}}>Previous caption</MenuAction>
     <MenuAction onClick={()=>{navigate(1);setMenu(null);}}>Next caption</MenuAction>
   </>}
 </EditorContextMenu>}
 <Dialog open={bulkText !== null} onOpenChange={open=>{if(!open)setBulkText(null);}}><DialogContent className="editor-dialog"><DialogTitle>Edit selected captions</DialogTitle><DialogDescription>Edit these captions together. Their timing and styling stay in place.</DialogDescription>{bulkText && project.captions.filter(c=>c.id in bulkText).map((c,i)=><label key={c.id}>Caption {i+1} · {time(c.start)}<textarea aria-label={`Bulk caption ${i+1}`} value={bulkText[c.id]} onChange={e=>setBulkText(v=>({...v,[c.id]:e.target.value}))}/></label>)}<button className="primary" onClick={()=>{if(bulkText)commit(p=>({...p,captions:p.captions.map(c=>c.id in bulkText?{...c,words:tokenize(bulkText[c.id],c.words)}:c)}));setBulkText(null);}}>Apply edits</button></DialogContent></Dialog>

 </main></TooltipProvider>;
}
