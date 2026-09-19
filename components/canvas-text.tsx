"use client";
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Caption, layoutCaption } from '@/lib/editor';
import { resolvedFont } from '@/lib/fonts';
export default function CanvasText({ caption: c, layout, onText, onSelection, editorRef }: {
    caption: Caption;
    layout: ReturnType<typeof layoutCaption>;
    onText: (text: string) => void;
    onSelection: (words: number[]) => void;
    editorRef: React.RefObject<HTMLDivElement | null>;
}) {
    const composing = useRef(false);
    useLayoutEffect(() => {
        const node = editorRef.current;
        if (!node || composing.current)
            return;
        const selection = window.getSelection();
        let offsets: number[] | null = null;
        if (selection?.rangeCount && node.contains(selection.anchorNode) && node.contains(selection.focusNode)) {
            const range = selection.getRangeAt(0), before = range.cloneRange();
            before.selectNodeContents(node);
            before.setEnd(range.startContainer, range.startOffset);
            const start = before.toString().length;
            offsets = [start, start + range.toString().length];
        }
        const items = layout.lines.flatMap(line => line.items);
        node.replaceChildren(...c.words.map((w, i) => {
            const span = document.createElement('span'); span.dataset.word = String(i); span.textContent = w.text;
            const item = items.find(item => item.index === i), previous = [...items].reverse().find(item => item.index < i);
            const size = w.size * c.scale;
            const x = item?.x ?? (previous ? previous.x + previous.width : 0);
            const baseline = item?.y ?? previous?.y ?? size * .85;
            const fontAscent = item?.fontAscent ?? size * .9, fontDescent = item?.fontDescent ?? size * .2;
            Object.assign(span.style, { position: 'absolute', left: `${x / 19.2}cqw`, top: `${(baseline - fontAscent - (size - fontAscent - fontDescent) / 2) / 19.2}cqw`, lineHeight: '1', whiteSpace: 'pre', fontWeight: w.bold ? '700' : '400', fontStyle: w.italic ? 'italic' : 'normal', fontSize: `${size / 19.2}cqw`, color: w.color });
            if (w.auto) span.title = `Auto emphasis: ${w.auto.reason}`;
            return span;
        }));
        if (offsets && selection) {
            const range = document.createRange();
            const at = (index: number): [
                Node,
                number
            ] => { let remaining = index; for (const span of Array.from(node.children)) {
                const text = span.firstChild;
                if (!text)
                    continue;
                if (remaining <= text.textContent!.length)
                    return [text, remaining];
                remaining -= text.textContent!.length;
            } return [node, node.childNodes.length]; };
            range.setStart(...at(offsets[0]));
            range.setEnd(...at(offsets[1]));
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }, [c.words, c.scale, c.font, c.spacing, c.lineHeight, c.width, c.align, c.lineMode, c.maxLines, layout.width, layout.height, editorRef]);
    const capture = () => { const node = editorRef.current, s = window.getSelection(); if (!node || !s?.rangeCount || s.isCollapsed || !node.contains(s.anchorNode) || !node.contains(s.focusNode)) {
        onSelection([]);
        return;
    } const r = s.getRangeAt(0), before = r.cloneRange(); before.selectNodeContents(node); before.setEnd(r.startContainer, r.startOffset); const start = before.toString().length, end = start + r.toString().length; let offset = 0; const indices: number[] = []; c.words.forEach((w, i) => { if (offset < end && offset + w.text.length > start && w.text.trim())
        indices.push(i); offset += w.text.length; }); onSelection(indices); };
    useEffect(() => { const onChange = () => { const s = window.getSelection(); if (s?.anchorNode && editorRef.current?.contains(s.anchorNode))
        capture(); }; document.addEventListener("selectionchange", onChange); return () => document.removeEventListener("selectionchange", onChange); });
    return <div ref={editorRef} className="word-editor" contentEditable suppressContentEditableWarning role="textbox" aria-label="Edit canvas caption" style={{ fontFamily: `"${resolvedFont(c.font)}",Arial,sans-serif`, fontSize: `${90 * c.scale / 19.2}cqw`, lineHeight: c.lineHeight, textAlign: c.align, letterSpacing: `${c.spacing * c.scale / 19.2}cqw` }} onPointerDown={e => e.stopPropagation()} onMouseUp={capture} onKeyUp={capture} onKeyDown={e => { if (e.key === 'Enter') {
        e.preventDefault();
        document.execCommand('insertText', false, c.lineMode === 'single' ? ' ' : '\n');
    } }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={e => { composing.current = false; onText(e.currentTarget.textContent ?? ''); }} onInput={e => { if (!composing.current)
        onText(e.currentTarget.textContent ?? ''); }} onPaste={e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); }}/>;
}
