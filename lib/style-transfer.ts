import { baseStyle, type Caption } from './editor.ts';
import { manualStyle } from './caption-tools.ts';

/** Repeat the source's visual word pattern in reading order; preserve target content and time. */
export function copyCaptionStyle(target: Caption, source: Caption): Caption {
  const { font, x, y, width, scale, align, lineHeight, spacing, lineMode, maxLines, baseSize, baseColor, anchor, motion } = source;
  const pattern = source.words.filter(w => w.text.trim()); let ordinal = 0;
  const words = target.words.map(w => {
    const style = pattern[(w.text.trim() ? ordinal++ : Math.max(0, ordinal - 1)) % pattern.length] ?? { ...baseStyle, size: baseSize ?? 90, color: baseColor ?? '#ffffff' };
    return manualStyle(w, { bold: style.bold, italic: style.italic, size: style.size, color: style.color });
  });
  return { ...target, font, x, y, width, scale, align, lineHeight, spacing, lineMode, maxLines, baseSize, baseColor, anchor, motion: motion ? structuredClone(motion) : undefined, words };
}

export function reorderCaptions(captions: Caption[], ids: string[], direction: 'forward' | 'back') {
  const result = [...captions];
  if (direction === 'forward') for (let i = result.length - 2; i >= 0; i--) {
    if (ids.includes(result[i].id) && !ids.includes(result[i + 1].id)) [result[i], result[i + 1]] = [result[i + 1], result[i]];
  }
  else for (let i = 1; i < result.length; i++) {
    if (ids.includes(result[i].id) && !ids.includes(result[i - 1].id)) [result[i], result[i - 1]] = [result[i - 1], result[i]];
  }
  return result;
}

export function marqueeIds(captions: Caption[], from: number, to: number) {
  const min = Math.min(from, to), max = Math.max(from, to);
  return captions.filter(c => c.end >= min && c.start <= max).map(c => c.id);
}
