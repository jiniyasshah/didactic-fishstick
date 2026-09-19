export type MotionKind = 'none' | 'fade' | 'slide' | 'scale' | 'blur' | 'pop' | 'reveal';
export type MotionEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
export type Motion = { kind: MotionKind; duration: number; easing: MotionEasing };
export type CaptionMotion = { in: Motion; out: Motion };
export const defaultMotion: CaptionMotion = { in: { kind: 'none', duration: .35, easing: 'ease-out' }, out: { kind: 'none', duration: .3, easing: 'ease-in' } };
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export function easing(value: number, ease: MotionEasing) { const t = clamp01(value); return ease === 'ease-in' ? t * t * t : ease === 'ease-out' ? 1 - (1 - t) ** 3 : ease === 'ease-in-out' ? t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2 : t; }
export function motionFrame(motion: CaptionMotion | undefined, elapsed: number, duration: number) {
  const settings = motion ?? defaultMotion;
  const state = { opacity: 1, x: 0, y: 0, scale: 1, blur: 0, reveal: 1 };
  const sum = (settings.in.kind === 'none' ? 0 : settings.in.duration) + (settings.out.kind === 'none' ? 0 : settings.out.duration);
  const factor = sum > duration ? duration / sum : 1;
  for (const direction of ['in', 'out'] as const) {
    const m = settings[direction], span = m.duration * factor;
    if (m.kind === 'none' || span <= 0) continue;
    const progress = easing((direction === 'in' ? elapsed : elapsed - duration + span) / span, m.easing);
    const p = direction === 'in' ? progress : 1 - progress;
    const hidden = 1 - p;
    if (m.kind === 'fade') state.opacity *= p;
    if (m.kind === 'slide') { state.y += hidden * (direction === 'in' ? 80 : -80); state.opacity *= p; }
    if (m.kind === 'scale') { state.scale *= .7 + .3 * p; state.opacity *= p; }
    if (m.kind === 'blur') { state.blur += hidden * 15; state.opacity *= p; }
    if (m.kind === 'pop') { state.scale *= .65 + .35 * p + Math.sin(p * Math.PI) * .16; state.opacity *= Math.min(1, p * 3); }
    if (m.kind === 'reveal') state.reveal *= p;
  }
  return state;
}
