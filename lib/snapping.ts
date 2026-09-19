import type { Caption } from './editor.ts';
export function snap(value: number, points: number[], threshold: number) {
  let target: number | null = null, distance = threshold;
  for (const point of points) if (Number.isFinite(point) && Math.abs(value - point) <= distance) { target = point; distance = Math.abs(value - point); }
  return { value: target ?? value, target };
}
export function timeBoundaries(captions: Caption[], ignore: string[] = []) {
  return [...new Set(captions.filter(c => !ignore.includes(c.id)).flatMap(c => [c.start, c.end, ...c.words.flatMap(w => [w.start, w.end].filter((v): v is number => v !== undefined))]))];
}
export function snapGroup(delta: number, edges: number[], points: number[], threshold: number) {
  let best = threshold, correction = 0, target: number | null = null;
  for (const edge of edges) { const result = snap(edge + delta, points, threshold); if (result.target !== null && Math.abs(result.value - edge - delta) <= best) { best = Math.abs(result.value - edge - delta); correction = result.value - edge - delta; target = result.target; } }
  return { delta: delta + correction, target };
}
