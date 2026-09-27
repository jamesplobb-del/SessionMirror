import PremiumReveal from './ui/PremiumReveal'
import { useState } from 'react'
import { normalizeDeskMetronome } from '../utils/deskMetronome'
import { getPracticeRhythmOptions, AUDIO_PRACTICE_CLICK_SOUNDS } from './audioPractice/audioPracticeMetronome'
import { SlidersHorizontal } from 'lucide-react'
import Pressable from './ui/Pressable'
import RoutineMetronomeEditor from './RoutineMetronomeEditor'
import RoutineProgramSetup from './RoutineProgramSetup'
import { getWrittenPitchLabel, type TunerTranspositionId } from '../utils/tunerTransposition'
import { homePitchClass } from '../utils/routinePresets'
import { blankDesk, type RoutineStep } from '../utils/practiceRoutines'
import type { DeskSnapshot } from '../utils/workspaceDesks'

export default function RoutineDeskSetup({
  step,
  instrumentId,
  tunerTransposition,
  hapticFeedback,
  onChange,
}: {
  step: RoutineStep
  instrumentId: string | null
  tunerTransposition: TunerTranspositionId
  hapticFeedback: boolean
  onChange: (patch: Partial<RoutineStep>) => void
}) {
  const [metronomeEditorOpen, setMetronomeEditorOpen] = useState(false)
  const savedDesk = step.desk ?? blankDesk('audio')
  const desk = { ...savedDesk, metronome: normalizeDeskMetronome(savedDesk.metronome) }
  const patchDesk = (patch: Partial<DeskSnapshot>) => onChange({ desk: { ...desk, ...patch } })
  const droneLabel = (pitchClass: number) =>
    getWrittenPitchLabel(pitchClass, desk.drone.octave, tunerTransposition).label

  const metronome = desk.metronome
  const subdivisionLabel = getPracticeRhythmOptions(metronome.meter, metronome.pulseModeId)
    .find(option => option.value === metronome.subdivision)?.name
  const soundLabel = AUDIO_PRACTICE_CLICK_SOUNDS
    .find(option => option.id === metronome.soundId)?.label
  const metronomeSummary = [
    `${Math.round(metronome.bpm)} BPM`,
    metronome.meter,
    subdivisionLabel,
    soundLabel,
  ].filter(Boolean).join(' · ')

  return (
    <section className="practice-menu-section">
      <p className="routine-tools-lead__intro">Set the tools you want ready for this exercise.</p>
      <div className="practice-menu-form routine-tools">
        <div className="routine-tool">
          <Pressable
            type="button"
            intensity="soft"
            haptic="light"
            hapticFeedback={hapticFeedback}
            className="routine-tool__toggle"
            role="switch"
            aria-checked={desk.showMetronome}
            onClick={() => patchDesk({ showMetronome: !desk.showMetronome })}
          >
            <strong>Metronome</strong>
            <i />
          </Pressable>
          <small className="routine-tool__hint">Keep a steady pulse at your chosen tempo.</small>
          <PremiumReveal open={desk.showMetronome} className="routine-metronome-controls">
              <Pressable
                type="button"
                intensity="soft"
                haptic="light"
                hapticFeedback={hapticFeedback}
                className="routine-metronome-open"
                onClick={() => setMetronomeEditorOpen(true)}
              >
                <SlidersHorizontal aria-hidden />
                <span>
                  <strong>{metronomeSummary}</strong>
                  <small>Open the metronome to set this item's click</small>
                </span>
              </Pressable>
          </PremiumReveal>
        </div>

        <div className="routine-tool">
          <Pressable
            type="button"
            intensity="soft"
            haptic="light"
            hapticFeedback={hapticFeedback}
            className="routine-tool__toggle"
            role="switch"
            aria-checked={desk.showDrone}
            onClick={() =>
              patchDesk({
                showDrone: !desk.showDrone,
                drone: {
                  ...desk.drone,
                  pitchClass: desk.drone.pitchClass ?? homePitchClass(instrumentId),
                },
              })
            }
          >
            <strong>Drone</strong>
            <i />
          </Pressable>
          <small className="routine-tool__hint">Choose the note as written for your instrument.</small>
          <PremiumReveal open={desk.showDrone}>
            <div className="routine-pitch-row" role="radiogroup" aria-label="Drone note">
              {Array.from({ length: 12 }, (_, pitchClass) => (
                <Pressable
                  key={pitchClass}
                  type="button"
                  intensity="soft"
                  haptic="light"
                  hapticFeedback={hapticFeedback}
                  role="radio"
                  aria-checked={desk.drone.pitchClass === pitchClass}
                  className={`routine-pitch ${desk.drone.pitchClass === pitchClass ? 'is-on' : ''}`}
                  onClick={() => patchDesk({ drone: { ...desk.drone, pitchClass } })}
                >
                  {droneLabel(pitchClass)}
                </Pressable>
              ))}
            </div>
          </PremiumReveal>
        </div>

        <div className="routine-tool"><Pressable
          type="button"
          intensity="soft"
          haptic="light"
          hapticFeedback={hapticFeedback}
          className="routine-tool__toggle"
          role="switch"
          aria-checked={desk.pitchTrackerEnabled}
          onClick={() => patchDesk({ pitchTrackerEnabled: !desk.pitchTrackerEnabled })}
        >
          <strong>Pitch graph</strong>
          <i />
        </Pressable>
        <small className="routine-tool__hint">See your pitch as you play.</small></div>

        {(step.kind === 'record' || step.kind === 'focus') && (
          <div className="routine-tool">
            <Pressable
              type="button"
              intensity="soft"
              haptic="light"
              hapticFeedback={hapticFeedback}
              className="routine-tool__toggle"
              role="switch"
              aria-checked={desk.autoSoundRecording}
              onClick={() => patchDesk({ autoSoundRecording: !desk.autoSoundRecording })}
            >
              <strong>Hands-free recording</strong>
              <i />
            </Pressable>
            <small className="routine-tool__hint">Waits for a quiet moment, then records sustained sound.</small>
          </div>
        )}
      </div>
      <RoutineProgramSetup value={step.programId} onChange={programId => onChange({ programId })} />
      <RoutineMetronomeEditor
        isOpen={metronomeEditorOpen}
        itemTitle={step.title}
        value={desk.metronome}
        onSave={prefs => patchDesk({ metronome: prefs })}
        onClose={() => setMetronomeEditorOpen(false)}
      />
    </section>
  )
}
