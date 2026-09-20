import { lazy, Suspense, useState, type RefObject } from 'react'
import { Activity, ChevronRight, FileMusic, Headphones, Minus, Shapes, Timer, X } from 'lucide-react'
import type { MultitrackPracticeSettings } from '../types'
import type { TunerInstrument } from '../../utils/pitchConfig'
import MultitrackClickSettings from './MultitrackClickSettings'
const LivePitchTuner = lazy(() => import('../../components/LivePitchTuner'))
export interface MultitrackRoutine {
  name: string; step: string; progress: string
  onNext: () => void; onOpen: () => void
}
export default function MultitrackWorkspaceTools({ practice, onChange, onOpenTools, streamRef, mediaRef, tunerInstrument, busy, routine, backingLabel, onOpenBacking, musicLabel, onOpenMusic }: {
  practice: MultitrackPracticeSettings; onChange: (patch: Partial<MultitrackPracticeSettings>) => void
  onOpenTools: () => void; streamRef: RefObject<MediaStream | null>; mediaRef: RefObject<HTMLMediaElement | null>; tunerInstrument: TunerInstrument
  busy: boolean; routine?: MultitrackRoutine; backingLabel?: string; onOpenBacking: () => void; musicLabel?: string; onOpenMusic: () => void
}) {
  const [expanded, setExpanded] = useState({ pitch: false, click: false })
  const toggle = (tool: 'pitch' | 'click') => setExpanded(value => ({ ...value, [tool]: !value[tool] }))
  const collapse = (tool: 'pitch' | 'click') => setExpanded(value => ({ ...value, [tool]: false }))
  const activeTools = (['pitch', 'click'] as const).filter(tool => expanded[tool] && (tool === 'pitch' ? practice.showPitch : practice.showMetronome))
  return <section className={`multitrack-workspace-tools ${activeTools.length ? 'has-expanded-tool' : ''}`} aria-label="Workspace tools">
    <div className="multitrack-workspace-tools__row">
      {practice.showMetronome && <button className="multitrack-tool-pin" aria-expanded={expanded.click} onClick={() => toggle('click')}><Timer size={15} />{Math.round(practice.bpm)} BPM</button>}
      {practice.showPitch && <button className="multitrack-tool-pin" aria-expanded={expanded.pitch} onClick={() => toggle('pitch')}><Activity size={15} />Tuner</button>}
      {backingLabel && <button className="multitrack-tool-pin multitrack-tool-pin--media" disabled={busy} onClick={onOpenBacking} aria-label="Open backing track"><Headphones size={15} /><span>{backingLabel}</span></button>}
      {musicLabel && <button className="multitrack-tool-pin multitrack-tool-pin--media" disabled={busy} onClick={onOpenMusic} aria-label="Open sheet music"><FileMusic size={15} /><span>{musicLabel}</span></button>}
      <button className="multitrack-tools-launch" onClick={onOpenTools}><Shapes size={17} />Tools</button>
    </div>
    {activeTools.map(active => <div key={active} className="multitrack-tool-expanded">
      <header><span>{active === 'pitch' ? 'Tuner' : 'Click & tempo'}</span><div><button aria-label={`Remove ${active === 'pitch' ? 'tuner' : 'click'} widget`} onClick={() => { onChange(active === 'pitch' ? { showPitch: false } : { showMetronome: false }); collapse(active) }}><X size={14} /></button><button aria-label={`Collapse ${active === 'pitch' ? 'tuner' : 'click'}`} onClick={() => collapse(active)}><Minus size={16} /></button></div></header>
      {active === 'pitch' ? <div className="multitrack-inline-tuner"><Suspense fallback={<p>Opening tuner…</p>}><LivePitchTuner variant="widget" mediaRef={mediaRef} mediaKey="multitrack-workspace" isPlaying={false} pitchSource="microphone" liveMicEnabled micStreamRef={streamRef} nativePitchProcessing tunerInstrument={tunerInstrument} audioToolsEnabled={false} /></Suspense></div> : <fieldset disabled={busy}><MultitrackClickSettings practice={practice} onChange={onChange} /></fieldset>}
    </div>)}
    {routine && <div className="multitrack-routine-strip"><button onClick={routine.onOpen} disabled={busy}><strong>{routine.step}</strong><span>{routine.name} · {routine.progress}</span></button><button onClick={routine.onNext} disabled={busy} aria-label="Complete routine step"><ChevronRight size={18} /></button></div>}
  </section>
}
