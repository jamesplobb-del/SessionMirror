import PremiumReveal from './ui/PremiumReveal'
import PremiumSelect from './ui/PremiumPicker'
import PremiumDisclosure from './ui/PremiumDisclosure'
import { useState } from 'react'
import { AudioLines, ChevronDown, ChevronRight, FileMusic, SlidersHorizontal, Waves } from 'lucide-react'
import { blankDesk, type RoutineStep } from '../utils/practiceRoutines'
import { normalizeDeskMetronome } from '../utils/deskMetronome'
import { homePitchClass } from '../utils/routinePresets'
import { getWrittenPitchLabel } from '../utils/tunerTransposition'
import type { DeskSnapshot } from '../utils/workspaceDesks'
import { getPracticeRhythmOptions, AUDIO_PRACTICE_CLICK_SOUNDS } from './audioPractice/audioPracticeMetronome'
import RoutineMetronomeEditor from './RoutineMetronomeEditor'
import RoutineReferenceSetup from './RoutineReferenceSetup'
import '../styles/routine-guide.css'
import '../styles/music-routine-builder.css'

/** The same per-exercise controls serve a routine step and a score in Music. */
export default function MusicToolSetup({ step, instrumentId, onChange }: {
  step: RoutineStep
  instrumentId: string | null
  onChange: (patch: Partial<RoutineStep>) => void
}) {
  const [metronomeOpen, setMetronomeOpen] = useState(false)
  const desk = step.desk ?? blankDesk('audio')
  const metronome = normalizeDeskMetronome(desk.metronome)
  const patchDesk = (patch: Partial<DeskSnapshot>) => onChange({ desk: { ...desk, ...patch } })
  const metronomeDetail = [metronome.meter,
    getPracticeRhythmOptions(metronome.meter, metronome.pulseModeId).find(option => option.value === metronome.subdivision)?.name,
    AUDIO_PRACTICE_CLICK_SOUNDS.find(option => option.id === metronome.soundId)?.label,
  ].filter(Boolean).join(' · ')

  return <>
    <span className="music-routine-tool-label">Tools</span>
    <div className="music-routine-tools">{([
      ['showMetronome', 'Metronome', SlidersHorizontal],
      ['showDrone', 'Drone', Waves],
      ['pitchTrackerEnabled', 'Pitch', AudioLines],
    ] as const).map(([key, label, Icon]) => <button type="button" key={key} aria-pressed={desk[key]}
      onClick={() => patchDesk({ [key]: !desk[key], ...(key === 'showDrone' && !desk.showDrone
        ? { drone: { ...desk.drone, pitchClass: desk.drone.pitchClass ?? homePitchClass(instrumentId) } } : {}) })}>
      <Icon aria-hidden /><span>{label}</span>
    </button>)}</div>
    <PremiumReveal open={desk.showMetronome}>
      <label className="music-routine-setting"><span>Tempo</span><span><input type="number" aria-label="Tempo in BPM" min={20} max={300}
        value={metronome.bpm} onChange={event => patchDesk({ metronome: normalizeDeskMetronome({ ...metronome, bpm: event.target.value }) })} /> <small>BPM</small></span></label>
      <button type="button" className="music-routine-open-metronome" onClick={() => setMetronomeOpen(true)}>
        <SlidersHorizontal aria-hidden /><span><strong>Metronome settings</strong><small>{metronomeDetail}</small></span><ChevronRight aria-hidden />
      </button>
    </PremiumReveal>
    <PremiumReveal open={desk.showDrone}><div className="music-routine-setting"><span>Drone note</span>
      <PremiumSelect title="Drone note" value={desk.drone.pitchClass == null ? '' : String(desk.drone.pitchClass)}
        options={[{ value: '', label: 'Choose a note' }, ...Array.from({ length: 12 }, (_, pitch) => ({ value: String(pitch), label: getWrittenPitchLabel(pitch, desk.drone.octave, 'concert').label }))]}
        onChange={value => patchDesk({ drone: { ...desk.drone, pitchClass: value === '' ? null : Number(value) } })} />
    </div></PremiumReveal>
    <PremiumDisclosure className="music-routine-reference"><summary><FileMusic aria-hidden /><span>Reference<small>{step.referenceVideoId ? 'Selected' : 'Add a recording'}</small></span><ChevronDown aria-hidden /></summary>
      <RoutineReferenceSetup instrumentId={instrumentId} title={step.title} value={step.referenceQuery}
        onChange={referenceQuery => onChange({ referenceQuery })} videoId={step.referenceVideoId}
        onVideoIdChange={referenceVideoId => onChange({ referenceVideoId })} />
    </PremiumDisclosure>
    <RoutineMetronomeEditor isOpen={metronomeOpen} itemTitle={step.title} value={metronome}
      onSave={metronome => patchDesk({ metronome })} onClose={() => setMetronomeOpen(false)} />
  </>
}
