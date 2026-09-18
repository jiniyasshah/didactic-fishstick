"use client";
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Caption } from '@/lib/editor';
export default function CanvasText({ caption: c, onText, onSelection, editorRef }: {
    caption: Caption;
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
        node.replaceChildren(...c.words.map((w, i) => { const span = document.createElement('span'); span.dataset.word = String(i); span.textContent = w.text; Object.assign(span.style, { fontWeight: w.bold ? '700' : '400', fontStyle: w.italic ? 'italic' : 'normal', fontSize: `${w.size * c.scale / 19.2}cqw`, color: w.color }); return span; }));
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
    }, [c.words, c.scale, editorRef]);
    const capture = () => { const node = editorRef.current, s = window.getSelection(); if (!node || !s?.rangeCount || s.isCollapsed || !node.contains(s.anchorNode) || !node.contains(s.focusNode)) {
        onSelection([]);
        return;
    } const r = s.getRangeAt(0), before = r.cloneRange(); before.selectNodeContents(node); before.setEnd(r.startContainer, r.startOffset); const start = before.toString().length, end = start + r.toString().length; let offset = 0; const indices: number[] = []; c.words.forEach((w, i) => { if (offset < end && offset + w.text.length > start && w.text.trim())
        indices.push(i); offset += w.text.length; }); onSelection(indices); };
    useEffect(() => { const onChange = () => { const s = window.getSelection(); if (s?.anchorNode && editorRef.current?.contains(s.anchorNode))
        capture(); }; document.addEventListener("selectionchange", onChange); return () => document.removeEventListener("selectionchange", onChange); });
    return <div ref={editorRef} className="word-editor" contentEditable suppressContentEditableWarning role="textbox" aria-label="Edit canvas caption" style={{ fontFamily: `"${c.font}","Gill Sans","Trebuchet MS",sans-serif`, fontSize: `${90 * c.scale / 19.2}cqw`, lineHeight: c.lineHeight, textAlign: c.align, letterSpacing: `${c.spacing / 19.2}cqw` }} onPointerDown={e => e.stopPropagation()} onMouseUp={capture} onKeyUp={capture} onKeyDown={e => { if (e.key === 'Enter') {
        e.preventDefault();
        document.execCommand('insertText', false, '\n');
    } }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={e => { composing.current = false; onText(e.currentTarget.innerText); }} onInput={e => { if (!composing.current)
        onText(e.currentTarget.innerText); }} onPaste={e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); }}/>;
}
