import { Plus, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import type { MetronomeMeter } from '../../utils/metronomeConfig'
import { formatBpmLabel } from '../../metronome/pulseResolution'
import { getPulseModesForMeter } from '../../metronome/pulseModes'
import Pressable from '../../components/ui/Pressable'
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
import { derivePatternStepBpm } from '../patternTempo'
import {
  meterSelectOptions,
  PATTERN_REPEAT_OPTIONS,
  pulseSelectOptions,
} from '../timelineEditorOptions'
import type { MeterPatternStep, PatternRepeatMode, TimelineSection } from '../types'
import EditableNumberValue from './EditableNumberValue'
import TimelineEditorSelect from './TimelineEditorSelect'

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
  }
}

export default function MeterPatternEditor({ section, onChange }: MeterPatternEditorProps) {
  const steps = section.patternSteps ?? []
  const repeat = section.patternRepeat ?? defaultPatternRepeat(steps)
  const totalMeasures = useMemo(() => patternMeasuresBeforeRepeat(section), [section])
  const cycleBars = patternCycleBars(steps)
  const meterOptions = useMemo(() => meterSelectOptions(), [])

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
    const nextStep = createPatternStep(last?.meter ?? '4/4')
    onChange(updateSteps(section, [...steps, nextStep]))
  }

  const removeStep = (index: number) => {
    if (steps.length <= 2) return
    const next = steps.filter((_, stepIndex) => stepIndex !== index)
    onChange(updateSteps(section, next))
  }

  const applyPreset34_68 = () => {
    const preset = [createPatternStep('3/4'), createPatternStep('6/8')]
    onChange({
      ...updateSteps(section, preset, { kind: 'totalMeasures', measures: 24 }),
      title: section.title === 'New Section' ? 'Alternating Feel' : section.title,
      bpm: section.bpm || 120,
    })
  }

  return (
    <div className="practice-timeline-editor__pattern">
      <div className="practice-timeline-editor__field">
        <span className="practice-timeline-editor__label">Pattern</span>
        <p className="practice-timeline-editor__hint">
          {formatPatternMetersLabel(steps)} • {formatPatternBpmLabel(section)}
        </p>
        <Pressable type="button" intensity="soft" className="practice-timeline-editor__preset-btn" onClick={applyPreset34_68}>
          3/4 + 6/8
        </Pressable>
      </div>

      <div className="practice-timeline-editor__field">
        <span className="practice-timeline-editor__label">Tempo</span>
        <div className="practice-timeline-editor__stepper">
          <Pressable
            type="button"
            intensity="icon"
            className="practice-timeline-editor__stepper-btn"
            onClick={() => onChange({ bpm: Math.max(40, section.bpm - 1) })}
          >
            −
          </Pressable>
          <EditableNumberValue
            value={section.bpm}
            min={40}
            max={300}
            ariaLabel="Type tempo"
            onCommit={(bpm) => onChange({ bpm })}
          />
          <span className="practice-timeline-editor__hint">♩ = BPM</span>
          <Pressable
            type="button"
            intensity="icon"
            className="practice-timeline-editor__stepper-btn"
            onClick={() => onChange({ bpm: Math.min(300, section.bpm + 1) })}
          >
            +
          </Pressable>
        </div>
      </div>

      {steps.map((step, index) => {
        const timing = resolvePatternStepTiming(step, index > 0 ? steps[index - 1] : undefined)
        const pulseModes = getPulseModesForMeter(step.meter)
        const derivedBpm = derivePatternStepBpm(section.bpm, step)
        return (
          <div key={step.id} className="practice-timeline-editor__pattern-step">
            <div className="practice-timeline-editor__pattern-step-header">
              <span className="practice-timeline-editor__pattern-step-title">Signature {index + 1}</span>
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

            <div className="practice-timeline-editor__select-grid">
              <TimelineEditorSelect
                label="Time signature"
                ariaLabel={`Step ${index + 1} time signature`}
                value={step.meter}
                options={meterOptions}
                onChange={(meter) =>
                  updateStep(index, applyMeterChangeToPatternStep(step, meter as MetronomeMeter))
                }
              />

              {pulseModes.length > 1 ? (
                <TimelineEditorSelect
                  label="Tempo counts"
                  ariaLabel={`Step ${index + 1} beat unit`}
                  value={step.pulseModeId ?? timing.pulseModeId}
                  options={pulseSelectOptions(pulseModes)}
                  onChange={(pulseModeId) =>
                    updateStep(index, {
                      pulseModeId,
                      feelId: undefined,
                      beatGrouping: undefined,
                      customAccents: undefined,
                    })
                  }
                />
              ) : null}
            </div>

            <p className="practice-timeline-editor__derived-tempo">
              Beat speed: {formatBpmLabel(derivedBpm, timing)}
            </p>
          </div>
        )
      })}

      <Pressable type="button" intensity="soft" className="practice-timeline-editor__pattern-add" onClick={addStep}>
        <Plus size={16} className="mr-1 inline" />
        Add signature
      </Pressable>

      <div className="practice-timeline-editor__select-grid">
        <TimelineEditorSelect
          label="Length"
          ariaLabel="How to repeat the meter pattern"
          value={repeat.kind}
          options={PATTERN_REPEAT_OPTIONS}
          onChange={setRepeatMode}
        />
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
          <span className="practice-timeline-editor__stepper-value">{repeat.measures} bars</span>
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
  )
}
