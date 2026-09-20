import { normalizeDeskMetronome } from '../utils/deskMetronome'
import { PRACTICE_ALL_METERS, getPracticeRhythmOptions, getPracticePulseModeOptions, getPracticeFeelOptions, AUDIO_PRACTICE_CLICK_SOUNDS } from './audioPractice/audioPracticeMetronome'
import { getMeterDefaults, getAccentLevelsForMeter, type MetronomeAccentLevel } from '../utils/metronomeConfig'
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
  const savedDesk = step.desk ?? blankDesk('audio')
  const desk = { ...savedDesk, metronome: normalizeDeskMetronome(savedDesk.metronome) }
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
            <div className="routine-metronome-controls"><div className="routine-stepper routine-stepper--wide" role="group" aria-label="Tempo">
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
              <label className="routine-tempo-field"><span>BPM</span><input type="number" min={30} max={240} value={desk.metronome.bpm} aria-label="Tempo in beats per minute" onChange={event => {
                const bpm = event.target.valueAsNumber
                if (Number.isFinite(bpm)) patchDesk({ metronome: { ...desk.metronome, bpm: Math.min(240, Math.max(30, Math.round(bpm))) } })
              }} /></label>
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
                      ...getMeterDefaults(event.target.value as DeskSnapshot['metronome']['meter']),
                    },
                  })
                }
              >
                {PRACTICE_ALL_METERS.map(meter => (
                  <option key={meter} value={meter}>{meter}</option>
                ))}
              </select>
            </div>
            <div className="routine-metronome-fields">
              <label>Pulse<select value={desk.metronome.pulseModeId ?? getMeterDefaults(desk.metronome.meter).pulseModeId} onChange={event => patchDesk({ metronome: { ...desk.metronome, ...getMeterDefaults(desk.metronome.meter, event.target.value) } })}>
                {getPracticePulseModeOptions(desk.metronome.meter).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select></label>
              <label>Subdivision<select value={desk.metronome.subdivision} onChange={event => patchDesk({ metronome: { ...desk.metronome, subdivision: event.target.value as DeskSnapshot['metronome']['subdivision'] } })}>
                {getPracticeRhythmOptions(desk.metronome.meter, desk.metronome.pulseModeId).map(option => <option key={option.value} value={option.value}>{option.name}</option>)}
              </select></label>
              {getPracticeFeelOptions(desk.metronome.meter, desk.metronome.pulseModeId).length > 0 && <label>Grouping<select value={desk.metronome.feelId} onChange={event => patchDesk({ metronome: { ...desk.metronome, feelId: event.target.value, accentLevels: getAccentLevelsForMeter(desk.metronome.meter, event.target.value, desk.metronome.pulseModeId) } })}>
                {getPracticeFeelOptions(desk.metronome.meter, desk.metronome.pulseModeId).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select></label>}
              <label>Sound<select value={desk.metronome.soundId} onChange={event => patchDesk({ metronome: { ...desk.metronome, soundId: event.target.value } })}>
                {AUDIO_PRACTICE_CLICK_SOUNDS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select></label>
            </div>
            <div className="routine-metronome-accents" role="group" aria-label="Beat accents">
              <span>Beat accents</span>
              {desk.metronome.accentLevels.map((accent, index) => <button key={index} type="button" data-accent={accent} aria-label={`Beat ${index + 1}: ${accent}. Tap to change accent.`} onClick={() => {
                const levels: MetronomeAccentLevel[] = ['strong', 'medium', 'weak', 'silent']
                const accentLevels = [...desk.metronome.accentLevels]
                accentLevels[index] = levels[(levels.indexOf(accent) + 1) % levels.length]
                patchDesk({ metronome: { ...desk.metronome, accentLevels } })
              }}>{index + 1}<small>{accent}</small></button>)}
            </div>
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
    </section>
  )
}
