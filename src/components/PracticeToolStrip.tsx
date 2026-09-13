import { useSyncExternalStore } from 'react'
import { AudioLines, ChevronDown, Gauge, Music2, Youtube } from 'lucide-react'
import { useSharedMetronome } from '../context/MetronomeContext'
import { getDroneSnapshot, subscribeDrone } from '../hooks/useDrone'
import { getWrittenPitchLabel, type TunerTranspositionId } from '../utils/tunerTransposition'
import './practice-tool-strip.css'

export type PracticeTool = 'metronome' | 'drone' | 'pitch'

/** Visibility controls only: the shared audio engines keep ownership of sound. */
export default function PracticeToolStrip({ metronome, drone, pitch, reference, referenceReady,
  expanded, onToggle, onReference, transposition, light, muted, referenceExpanded, disabled = false,
}: {
  metronome: boolean; drone: boolean; pitch: boolean; reference: boolean; referenceReady: boolean
  expanded: PracticeTool | null; onToggle: (tool: PracticeTool) => void; onReference: () => void
  transposition: TunerTranspositionId; light: boolean; muted: boolean; referenceExpanded: boolean; disabled?: boolean
}) {
  const metro = useSharedMetronome()
  const droneState = useSyncExternalStore(subscribeDrone, getDroneSnapshot, getDroneSnapshot)
  const sounding = droneState.enabled && droneState.activeNotes.length > 0
  const note = getWrittenPitchLabel(droneState.activeNotes[0] ?? droneState.lastPitchClass ?? 9, droneState.octave, transposition).label
  if (!metronome && !drone && !pitch && !reference) return null
  return <nav className={`practice-tool-strip${light ? ' practice-tool-strip--light' : ''}`} aria-label="Practice tools in use">
    {metronome && <button data-tool="metronome" disabled={disabled} aria-expanded={expanded === 'metronome'} onClick={() => onToggle('metronome')}
      aria-label={`Metronome ${metro.bpm} BPM, ${metro.playing ? muted ? 'muted during playback' : 'playing' : 'paused'}. ${expanded === 'metronome' ? 'Collapse' : 'Expand'} controls`}
      data-active={metro.playing && !muted}><Music2 aria-hidden /><span>{metro.bpm} BPM</span><i aria-hidden /></button>}
    {drone && <button data-tool="drone" disabled={disabled} aria-expanded={expanded === 'drone'} onClick={() => onToggle('drone')}
      aria-label={`Drone ${note}, ${sounding ? 'playing' : 'silent'}. ${expanded === 'drone' ? 'Collapse' : 'Expand'} controls`}
      data-active={sounding}><AudioLines aria-hidden /><span>Drone {note}</span><i aria-hidden /></button>}
    {pitch && <button data-tool="pitch" disabled={disabled} aria-expanded={expanded === 'pitch'} onClick={() => onToggle('pitch')}><Gauge aria-hidden /><span>Tuner</span><ChevronDown aria-hidden /></button>}
    {reference && <button disabled={disabled} aria-expanded={referenceExpanded} onClick={onReference} aria-label={referenceExpanded ? 'Collapse reference' : referenceReady ? 'Open reference' : 'Find a reference: search YouTube or paste a link'}>
      <Youtube aria-hidden /><span>{referenceReady ? 'Reference' : 'Find reference'}</span><ChevronDown aria-hidden /></button>}
  </nav>
}
