import type { Caption } from '@/lib/editor';
import { defaultMotion, type Motion, type MotionKind, type MotionEasing } from '@/lib/motion';
import { Field } from './caption-controls';

export default function MotionControls({ caption, patch }: { caption: Caption; patch: (p: Partial<Caption>) => void }) {
  const motion = caption.motion ?? defaultMotion;
  const update = (side: 'in' | 'out', values: Partial<Motion>) => patch({ motion: { ...motion, [side]: { ...motion[side], ...values } } });
  return <details className="property-group control-details motion-panel"><summary>Caption animations</summary>{(['in', 'out'] as const).map(side => <div key={side} className="motion-controls"><label>{side === 'in' ? 'In animation' : 'Out animation'}<select aria-label={`${side} animation`} value={motion[side].kind} onChange={e => update(side, { kind: e.target.value as MotionKind })}>{(['none', 'fade', 'slide', 'scale', 'blur', 'pop', 'reveal'] as const).map((kind, i) => <option key={kind} value={kind}>{['None', 'Fade', 'Slide', 'Scale', 'Blur / focus', 'Pop', 'Type / reveal'][i]}</option>)}</select></label><Field label={`${side} duration (s)`} value={motion[side].duration} min={0} max={5} step={.05} onChange={duration => update(side, { duration })}/><label>Easing<select aria-label={`${side} easing`} value={motion[side].easing} onChange={e => update(side, { easing: e.target.value as MotionEasing })}>{['linear','ease-in','ease-out','ease-in-out'].map(e => <option key={e}>{e}</option>)}</select></label></div>)}<p className="panel-help">Applies to the current edit scope. Short captions automatically fit both animations into their duration.</p></details>;
}

