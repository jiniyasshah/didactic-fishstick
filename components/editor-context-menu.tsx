import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export type ContextTarget = { x: number; y: number; kind: 'caption' | 'canvas' | 'audio' | 'empty'; id?: string; track?: 'original' | 'vocals' | 'instrumental'; time?: number };
export function MenuAction({ children, onClick, disabled = false }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button role="menuitem" disabled={disabled} onClick={onClick}>{children}</button>;
}
export default function EditorContextMenu({ target, close, children }: { target: ContextTarget; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null), [position, setPosition] = useState({ x: target.x, y: target.y });
  useLayoutEffect(() => {
    const place = () => { const box = ref.current!.getBoundingClientRect(); setPosition({ x: Math.max(8, Math.min(target.x, window.innerWidth - box.width - 8)), y: Math.max(8, Math.min(target.y, window.innerHeight - box.height - 8)) }); };
    place(); const observer = new ResizeObserver(place); observer.observe(ref.current!); window.addEventListener('resize', place);
    ref.current?.focus({ preventScroll: true });
    return () => { observer.disconnect(); window.removeEventListener('resize', place); };
  }, [target.x, target.y]);
  useEffect(() => { const outside = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close(); }; const escape = (e: KeyboardEvent) => { if(e.key === 'Escape') { e.stopPropagation(); close(); } }; document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape, true); return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); }; }, [close]);
  return <div ref={ref} role="menu" aria-label={`${target.kind} context menu`} tabIndex={-1} className="editor-context-menu" style={{ left: position.x, top: position.y }} onContextMenu={e => e.preventDefault()} onPointerDown={e => e.stopPropagation()} onKeyDown={e => { e.stopPropagation(); if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) { e.preventDefault(); const items = [...ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')], i = items.indexOf(document.activeElement as HTMLButtonElement); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); } }}>{children}</div>;
}
