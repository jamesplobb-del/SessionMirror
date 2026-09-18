import { Minus, Plus } from 'lucide-react'
import Pressable from './ui/Pressable'
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
  const desk = step.desk ?? blankDesk('audio')
  const patchDesk = (patch: Partial<DeskSnapshot>) => onChange({ desk: { ...desk, ...patch } })
  const droneLabel = (pitchClass: number) =>
    getWrittenPitchLabel(pitchClass, desk.drone.octave, tunerTransposition).label

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
          {desk.showMetronome && (
            <div className="routine-stepper routine-stepper--wide" role="group" aria-label="Tempo">
              <Pressable
                type="button"
                intensity="icon"
                haptic="light"
                hapticFeedback={hapticFeedback}
                aria-label="Slower"
                onClick={() =>
                  patchDesk({ metronome: { ...desk.metronome, bpm: Math.max(30, desk.metronome.bpm - 4) } })
                }
              >
                <Minus aria-hidden />
              </Pressable>
              <strong>♩{desk.metronome.bpm}</strong>
              <Pressable
                type="button"
                intensity="icon"
                haptic="light"
                hapticFeedback={hapticFeedback}
                aria-label="Faster"
                onClick={() =>
                  patchDesk({ metronome: { ...desk.metronome, bpm: Math.min(240, desk.metronome.bpm + 4) } })
                }
              >
                <Plus aria-hidden />
              </Pressable>
              <select
                value={desk.metronome.meter}
                aria-label="Time signature"
                onChange={event =>
                  patchDesk({
                    metronome: {
                      ...desk.metronome,
                      meter: event.target.value as DeskSnapshot['metronome']['meter'],
                    },
                  })
                }
              >
                {(['2/4', '3/4', '4/4', '6/8'] as const).map(meter => (
                  <option key={meter} value={meter}>{meter}</option>
                ))}
              </select>
            </div>
          )}
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
                  pitchClass: desk.drone.pitchClass ?? homePitchClass(instrumentId) ?? 9,
                },
              })
            }
          >
            <strong>Drone</strong>
            <i />
          </Pressable>
          <small className="routine-tool__hint">A reference pitch to play against.</small>
          {desk.showDrone && (
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
          )}
        </div>

        <Pressable
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
        <small className="routine-tool__hint">See your pitch as you play.</small>

        {(step.kind === 'record' || step.kind === 'focus') && (
          <>
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
          </>
        )}
      </div>
      <RoutineProgramSetup value={step.programId} onChange={programId => onChange({ programId })} />
    </section>
  )
}
