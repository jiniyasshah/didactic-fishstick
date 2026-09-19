import { Download, Music2, Volume2, VolumeX } from 'lucide-react';
import { trackGain, type Mixer, type TrackName } from '@/lib/editor';
export const trackNames: Record<TrackName, string> = { original: 'Original audio', vocals: 'Vocals', instrumental: 'Instrumental' };
export default function MixerPanel({ mixer, available, onChange, onDownload }: {
  mixer: Mixer; available: TrackName[];
  onChange: (key: TrackName, patch: Partial<Mixer[TrackName]>) => void;
  onDownload: (key: 'vocals' | 'instrumental') => void;
}) {
  return <div className="mixer-panel"><div className="section-label">AUDIO MIXER</div>{(['original', 'vocals', 'instrumental'] as const).map(key => {
    const state = mixer[key], ready = available.includes(key), audible = trackGain(mixer, key, available) > 0;
    return <div key={key} className={'mixer-track ' + (audible && ready ? 'audible' : '')}>
      <div className="mixer-title"><Music2 size={14}/><strong>{trackNames[key]}</strong><span className="mixer-dot" title={ready ? audible ? 'Audible' : 'Silent' : 'Separate to enable'}/>{key !== 'original' && <button aria-label={`Download ${key}`} disabled={!ready} onClick={() => onDownload(key)}><Download size={13}/></button>}</div>
      <div className="mixer-controls"><button aria-label={`${state.muted ? 'Unmute' : 'Mute'} ${trackNames[key]}`} aria-pressed={state.muted} disabled={!ready} className={state.muted ? 'active' : ''} onClick={() => onChange(key, { muted: !state.muted })}>{state.muted ? <VolumeX size={14}/> : <Volume2 size={14}/>}</button><button aria-label={`Solo ${trackNames[key]}`} aria-pressed={state.solo} disabled={!ready} className={state.solo ? 'active' : ''} onClick={() => onChange(key, { solo: !state.solo, ...(!state.solo ? { muted: false } : {}) })}>S</button><input aria-label={`${trackNames[key]} volume`} type="range" min={0} max={100} value={Math.round(state.volume * 100)} disabled={!ready} onChange={e => onChange(key, { volume: +e.target.value / 100 })}/><output>{Math.round(state.volume * 100)}%</output></div>
      {!ready && <small>{key === 'original' ? 'Import audio to begin' : 'Available after separation'}</small>}
    </div>;
  })}<p className="panel-help">Combine any tracks. Solo isolates the tracks marked S.</p></div>;
}
