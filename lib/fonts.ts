const resolved = new Map<string, string>();
const pending = new Map<string, Promise<void>>();
export const resolvedFont = (family: string) => resolved.get(family) ?? 'Arial';
export function registerLoadedFont(family: string) { resolved.set(family, family); pending.delete(family); }

export function ensureFont(family: string, text = 'Winter MWiw') {
  if (resolved.has(family)) return Promise.resolve();
  const existing = pending.get(family); if (existing) return existing;
  const job = (async () => {
    if (typeof document === 'undefined') return;
    const safe = family.replace(/["\\]/g, '');
    try {
      const faces = await Promise.all(['normal 400', 'normal 700', 'italic 400', 'italic 700'].map(style => document.fonts.load(`${style} 72px "${safe}"`, text)));
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.font = '72px monospace'; const fallback = ctx.measureText('MWiw Winter 123').width;
      ctx.font = `72px "${safe}", monospace`;
      const present = faces.some(f => f.length) || Math.abs(ctx.measureText('MWiw Winter 123').width - fallback) > .1;
      resolved.set(family, present ? family : 'Arial');
    } catch { resolved.set(family, 'Arial'); }
  })();
  pending.set(family, job); return job;
}
