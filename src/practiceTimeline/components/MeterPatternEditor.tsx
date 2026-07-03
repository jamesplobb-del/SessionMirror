import { Plus, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import type { MetronomeMeter } from '../../utils/metronomeConfig'
import { getPulseModesForMeter } from '../../metronome/pulseModes'
import Pressable from '../../components/ui/Pressable'
import { COMMON_METERS } from '../sectionDefaults'
import {
  applyMeterChangeToPatternStep,
  createPatternStep,
  defaultPatternRepeat,
  formatPatternBpmLabel,
  formatPatternMetersLabel,
  patternCycleBars,
  patternMeasuresBeforeRepeat,
  patternRepeatSummary,
  resolvePatternStepTiming,
} from '../patternLogic'
import type { MeterPatternStep, PatternRepeatMode, TimelineSection } from '../types'

interface MeterPatternEditorProps {
  section: TimelineSection
  onChange: (patch: Partial<TimelineSection>) => void
}

function updateSteps(
  section: TimelineSection,
  steps: MeterPatternStep[],
  patternRepeat?: PatternRepeatMode,
): Partial<TimelineSection> {
  const nextRepeat = patternRepeat ?? section.patternRepeat ?? defaultPatternRepeat(steps)
  const first = steps[0]
  return {
    patternSteps: steps,
    patternRepeat: nextRepeat,
    meter: first?.meter ?? section.meter,
    bpm: first?.bpm ?? section.bpm,
  }
}

export default function MeterPatternEditor({ section, onChange }: MeterPatternEditorProps) {
  const steps = section.patternSteps ?? []
  const repeat = section.patternRepeat ?? defaultPatternRepeat(steps)
  const totalMeasures = useMemo(() => patternMeasuresBeforeRepeat(section), [section])
  const cycleBars = patternCycleBars(steps)

  const setRepeatMode = (kind: PatternRepeatMode['kind']) => {
    if (kind === 'totalMeasures') {
      onChange({
        patternRepeat: { kind: 'totalMeasures', measures: Math.max(cycleBars, totalMeasures) },
      })
      return
    }
    const cycles = repeat.kind === 'cycles' ? repeat.cycles : Math.max(1, Math.ceil(totalMeasures / cycleBars))
    onChange({ patternRepeat: { kind: 'cycles', cycles } })
  }

  const updateStep = (index: number, patch: Partial<MeterPatternStep>) => {
    const next = steps.map((step, stepIndex) => (stepIndex === index ? { ...step, ...patch } : step))
    onChange(updateSteps(section, next))
  }

  const addStep = () => {
    const last = steps[steps.length - 1]
    const nextStep = createPatternStep(last?.meter ?? '4/4', last?.bpm ?? section.bpm)
    onChange(updateSteps(section, [...steps, nextStep]))
  }

  const removeStep = (index: number) => {
    if (steps.length <= 2) return
    const next = steps.filter((_, stepIndex) => stepIndex !== index)
    onChange(updateSteps(section, next))
  }

  const applyPreset34_68 = () => {
    const preset = [createPatternStep('3/4', 120), createPatternStep('6/8', 80)]
    onChange({
      ...updateSteps(section, preset, { kind: 'totalMeasures', measures: 24 }),
      title: section.title === 'New Section' ? 'Alternating Feel' : section.title,
    })
  }

  return (
    <div className="practice-timeline-editor__pattern">
      <div className="practice-timeline-editor__field">
        <span className="practice-timeline-editor__label">Meter pattern</span>
        <p className="practice-timeline-editor__hint">
          {formatPatternMetersLabel(steps)} • {formatPatternBpmLabel(steps)}
        </p>
        <Pressable type="button" intensity="soft" className="practice-timeline-editor__chip" onClick={applyPreset34_68}>
          Preset: 3/4 + 6/8
        </Pressable>
      </div>

      {steps.map((step, index) => {
        const timing = resolvePatternStepTiming(step, index > 0 ? steps[index - 1] : undefined)
        const pulseModes = getPulseModesForMeter(step.meter)
        return (
          <div key={step.id} className="practice-timeline-editor__pattern-step">
            <div className="practice-timeline-editor__pattern-step-header">
              <span className="practice-timeline-editor__pattern-step-title">Step {index + 1}</span>
              {steps.length > 2 ? (
                <Pressable
                  type="button"
                  intensity="icon"
                  aria-label={`Remove step ${index + 1}`}
                  onClick={() => removeStep(index)}
                >
                  <Trash2 size={16} />
                </Pressable>
              ) : null}
            </div>

            <div className="practice-timeline-editor__chips">
              {COMMON_METERS.map((meter) => (
                <Pressable
                  key={`${step.id}-${meter}`}
                  type="button"
                  intensity="soft"
                  className={`practice-timeline-editor__chip ${step.meter === meter ? 'practice-timeline-editor__chip--active' : ''}`}
                  onClick={() => updateStep(index, applyMeterChangeToPatternStep(step, meter as MetronomeMeter))}
                >
                  {meter}
                </Pressable>
              ))}
            </div>

            {pulseModes.length > 1 ? (
              <div className="practice-timeline-editor__chips mt-2">
                {pulseModes.map((mode) => (
                  <Pressable
                    key={mode.id}
                    type="button"
                    intensity="soft"
                    className={`practice-timeline-editor__chip ${(step.pulseModeId ?? timing.pulseModeId) === mode.id ? 'practice-timeline-editor__chip--active' : ''}`}
                    onClick={() =>
                      updateStep(index, {
                        pulseModeId: mode.id,
                        feelId: undefined,
                        beatGrouping: undefined,
                        customAccents: undefined,
                      })
                    }
                  >
                    {mode.label}
                  </Pressable>
                ))}
              </div>
            ) : null}

            <div className="practice-timeline-editor__stepper mt-2">
              <Pressable
                type="button"
                intensity="icon"
                className="practice-timeline-editor__stepper-btn"
                onClick={() => updateStep(index, { bpm: Math.max(40, step.bpm - 1) })}
              >
                −
              </Pressable>
              <span className="practice-timeline-editor__stepper-value">{step.bpm}</span>
              <span className="practice-timeline-editor__hint">{timing.bpmSymbol} = BPM</span>
              <Pressable
                type="button"
                intensity="icon"
                className="practice-timeline-editor__stepper-btn"
                onClick={() => updateStep(index, { bpm: Math.min(300, step.bpm + 1) })}
              >
                +
              </Pressable>
            </div>
          </div>
        )
      })}

      <Pressable type="button" intensity="soft" className="practice-timeline-editor__pattern-add" onClick={addStep}>
        <Plus size={16} className="mr-1 inline" />
        Add step
      </Pressable>

      <div className="practice-timeline-editor__field">
        <span className="practice-timeline-editor__label">Repeat pattern</span>
        <div className="practice-timeline-editor__chips">
          <Pressable
            type="button"
            intensity="soft"
            className={`practice-timeline-editor__chip ${repeat.kind === 'cycles' ? 'practice-timeline-editor__chip--active' : ''}`}
            onClick={() => setRepeatMode('cycles')}
          >
            By count
          </Pressable>
          <Pressable
            type="button"
            intensity="soft"
            className={`practice-timeline-editor__chip ${repeat.kind === 'totalMeasures' ? 'practice-timeline-editor__chip--active' : ''}`}
            onClick={() => setRepeatMode('totalMeasures')}
          >
            Until measure
          </Pressable>
        </div>

        {repeat.kind === 'cycles' ? (
          <div className="practice-timeline-editor__stepper mt-2">
            <Pressable
              type="button"
              intensity="icon"
              className="practice-timeline-editor__stepper-btn"
              onClick={() =>
                onChange({
                  patternRepeat: { kind: 'cycles', cycles: Math.max(1, (repeat.cycles ?? 1) - 1) },
                })
              }
            >
              −
            </Pressable>
            <span className="practice-timeline-editor__stepper-value">{repeat.cycles}×</span>
            <span className="practice-timeline-editor__hint">{cycleBars * repeat.cycles} bars total</span>
            <Pressable
              type="button"
              intensity="icon"
              className="practice-timeline-editor__stepper-btn"
              onClick={() =>
                onChange({
                  patternRepeat: { kind: 'cycles', cycles: Math.min(99, repeat.cycles + 1) },
                })
              }
            >
              +
            </Pressable>
          </div>
        ) : (
          <div className="practice-timeline-editor__stepper mt-2">
            <Pressable
              type="button"
              intensity="icon"
              className="practice-timeline-editor__stepper-btn"
              onClick={() =>
                onChange({
                  patternRepeat: {
                    kind: 'totalMeasures',
                    measures: Math.max(cycleBars, repeat.measures - 1),
                  },
                })
              }
            >
              −
            </Pressable>
            <span className="practice-timeline-editor__stepper-value">m. {repeat.measures}</span>
            <span className="practice-timeline-editor__hint">{patternRepeatSummary(section)}</span>
            <Pressable
              type="button"
              intensity="icon"
              className="practice-timeline-editor__stepper-btn"
              onClick={() =>
                onChange({
                  patternRepeat: {
                    kind: 'totalMeasures',
                    measures: Math.min(512, repeat.measures + 1),
                  },
                })
              }
            >
              +
            </Pressable>
          </div>
        )}
      </div>
    </div>
  )
}
