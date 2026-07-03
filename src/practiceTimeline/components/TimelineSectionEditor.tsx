import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { MetronomeMeter, MetronomeSubdivision } from '../../utils/metronomeConfig'
import Pressable from '../../components/ui/Pressable'
import {
  formatGrouping,
  groupingValidationMessage,
  parseGroupingInput,
  validateGroupingForMeter,
} from '../groupingUtils'
import { createPatternStep, defaultPatternRepeat, sectionHasMeterPattern } from '../patternLogic'
import { COMMON_METERS, repeatLabel } from '../sectionDefaults'
import {
  applyMeterChange,
  pulseModeOptionsForSection,
  resolveSectionTiming,
  sectionNeedsFeelPrompt,
  sectionNeedsPulseModeChoice,
  subdivisionOptionsForSection,
  tempoRampLabel,
} from '../timeSignatureLogic'
import type { SectionSubdivision, TimelineSection } from '../types'
import MeterPatternEditor from './MeterPatternEditor'
import SectionAccentEditor from './SectionAccentEditor'

const SUBDIVISION_LABELS: Record<MetronomeSubdivision, string> = {
  off: 'Pulse only',
  '8ths': '8ths',
  '16ths': '16ths',
  triplets: 'Triplets',
  dotted: 'Dotted',
  quints: 'Quints',
  septuplets: '7-tuplets',
}

interface TimelineSectionEditorProps {
  section: TimelineSection
  onChange: (patch: Partial<TimelineSection>) => void
  onClose: () => void
}

export default function TimelineSectionEditor({
  section,
  onChange,
  onClose,
}: TimelineSectionEditorProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [groupingDraft, setGroupingDraft] = useState(
    () => section.advanced?.beatGrouping?.length ? formatGrouping(section.advanced.beatGrouping) : '',
  )
  const timing = useMemo(() => resolveSectionTiming(section), [section])
  const rampLabel = tempoRampLabel(section)
  const isPatternMode = sectionHasMeterPattern(section)

  const enablePatternMode = () => {
    const steps = [createPatternStep(section.meter, section.bpm), createPatternStep('6/8', section.bpm)]
    onChange({
      patternSteps: steps,
      patternRepeat: defaultPatternRepeat(steps),
    })
  }

  const disablePatternMode = () => {
    onChange({ patternSteps: undefined, patternRepeat: undefined })
  }

  const subdivisionChoices = useMemo(() => {
    const available = subdivisionOptionsForSection(section)
    const choices: { id: SectionSubdivision; label: string }[] = [{ id: 'auto', label: 'Auto' }]
    for (const value of available) {
      choices.push({ id: value, label: SUBDIVISION_LABELS[value] ?? value })
    }
    return choices
  }, [section])

  const pulseModes = useMemo(() => pulseModeOptionsForSection(section), [section])

  const accentLevels =
    section.advanced?.customAccents?.length
      ? section.advanced.customAccents
      : timing.accentLevels

  const applyCustomGrouping = (text: string) => {
    setGroupingDraft(text)
    const parsed = parseGroupingInput(text)
    if (!parsed) {
      if (!text.trim()) {
        onChange({
          advanced: { ...section.advanced, beatGrouping: undefined },
        })
      }
      return
    }
    if (!validateGroupingForMeter(parsed, section)) return
    onChange({
      feelId: undefined,
      pulseModeId: section.pulseModeId,
      advanced: {
        ...section.advanced,
        beatGrouping: parsed,
        customAccents: undefined,
      },
    })
  }

  return (
    <div className="practice-timeline-editor pointer-events-auto">
      <header className="practice-timeline-editor__header">
        <Pressable type="button" intensity="icon" onClick={onClose} aria-label="Close">
          <X size={22} />
        </Pressable>
        <span className="practice-timeline-editor__title">Edit Section</span>
        <Pressable type="button" intensity="soft" haptic="success" onClick={onClose}>
          Done
        </Pressable>
      </header>

      <div className="practice-timeline-editor__body">
        <div className="practice-timeline-editor__field">
          <label className="practice-timeline-editor__label" htmlFor="section-title">
            Title
          </label>
          <input
            id="section-title"
            className="practice-timeline-editor__input"
            value={section.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Warm Up"
          />
        </div>

        <div className="practice-timeline-editor__field">
          <span className="practice-timeline-editor__label">Section type</span>
          <div className="practice-timeline-editor__chips">
            <Pressable
              type="button"
              intensity="soft"
              className={`practice-timeline-editor__chip ${!isPatternMode ? 'practice-timeline-editor__chip--active' : ''}`}
              onClick={disablePatternMode}
            >
              Single meter
            </Pressable>
            <Pressable
              type="button"
              intensity="soft"
              className={`practice-timeline-editor__chip ${isPatternMode ? 'practice-timeline-editor__chip--active' : ''}`}
              onClick={enablePatternMode}
            >
              Meter pattern
            </Pressable>
          </div>
        </div>

        {isPatternMode ? (
          <MeterPatternEditor section={section} onChange={onChange} />
        ) : (
          <>
        <div className="practice-timeline-editor__field">
          <span className="practice-timeline-editor__label">How many bars?</span>
          <div className="practice-timeline-editor__stepper">
            <Pressable
              type="button"
              intensity="icon"
              className="practice-timeline-editor__stepper-btn"
              onClick={() => onChange({ bars: Math.max(1, section.bars - 1) })}
            >
              −
            </Pressable>
            <span className="practice-timeline-editor__stepper-value">{section.bars}</span>
            <Pressable
              type="button"
              intensity="icon"
              className="practice-timeline-editor__stepper-btn"
              onClick={() => onChange({ bars: Math.min(128, section.bars + 1) })}
            >
              +
            </Pressable>
          </div>
        </div>

        <div className="practice-timeline-editor__field">
          <span className="practice-timeline-editor__label">How fast?</span>
          <div className="practice-timeline-editor__stepper">
            <Pressable
              type="button"
              intensity="icon"
              className="practice-timeline-editor__stepper-btn"
              onClick={() => onChange({ bpm: Math.max(40, section.bpm - 1) })}
            >
              −
            </Pressable>
            <span className="practice-timeline-editor__stepper-value">{section.bpm}</span>
            <span className="practice-timeline-editor__hint">{timing.bpmSymbol} = BPM</span>
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

        <div className="practice-timeline-editor__field">
          <span className="practice-timeline-editor__label">Time signature</span>
          <div className="practice-timeline-editor__chips">
            {COMMON_METERS.map((meter) => (
              <Pressable
                key={meter}
                type="button"
                intensity="soft"
                className={`practice-timeline-editor__chip ${section.meter === meter ? 'practice-timeline-editor__chip--active' : ''}`}
                onClick={() => onChange(applyMeterChange(section, meter as MetronomeMeter))}
              >
                {meter}
              </Pressable>
            ))}
          </div>
        </div>

        {sectionNeedsPulseModeChoice(section) ? (
          <div className="practice-timeline-editor__field">
            <span className="practice-timeline-editor__label">Pulse (what BPM means)</span>
            <div className="practice-timeline-editor__chips">
              {pulseModes.map((mode) => (
                <Pressable
                  key={mode.id}
                  type="button"
                  intensity="soft"
                  className={`practice-timeline-editor__chip ${(section.pulseModeId ?? timing.pulseModeId) === mode.id ? 'practice-timeline-editor__chip--active' : ''}`}
                  onClick={() =>
                    onChange({
                      pulseModeId: mode.id,
                      feelId: undefined,
                      subdivision: 'auto',
                      advanced: {
                        ...section.advanced,
                        beatGrouping: undefined,
                        customAccents: undefined,
                      },
                    })
                  }
                >
                  {mode.label}
                </Pressable>
              ))}
            </div>
          </div>
        ) : null}

        {sectionNeedsFeelPrompt(section) && timing.feelOptions.length > 0 ? (
          <div className="practice-timeline-editor__field">
            <span className="practice-timeline-editor__label">Beat grouping</span>
            <div className="practice-timeline-editor__chips">
              {timing.feelOptions.map((option) => (
                <Pressable
                  key={option.id}
                  type="button"
                  intensity="soft"
                  className={`practice-timeline-editor__chip ${section.feelId === option.id || (!section.feelId && !section.advanced?.beatGrouping?.length && option.id === timing.feelOptions[0]?.id) ? 'practice-timeline-editor__chip--active' : ''}`}
                  onClick={() => {
                    setGroupingDraft('')
                    onChange({
                      feelId: option.id,
                      advanced: {
                        ...section.advanced,
                        beatGrouping: undefined,
                        customAccents: undefined,
                      },
                    })
                  }}
                >
                  {option.label}
                </Pressable>
              ))}
            </div>
          </div>
        ) : null}

        <div className="practice-timeline-editor__field">
          <span className="practice-timeline-editor__label">Custom grouping</span>
          <input
            className="practice-timeline-editor__input"
            value={groupingDraft}
            onChange={(e) => applyCustomGrouping(e.target.value)}
            placeholder="e.g. 2+2+3"
            inputMode="text"
          />
          <p className="practice-timeline-editor__hint">{groupingValidationMessage(section)}</p>
        </div>

        <div className="practice-timeline-editor__field">
          <span className="practice-timeline-editor__label">Subdivision</span>
          <div className="practice-timeline-editor__chips">
            {subdivisionChoices.map((option) => (
              <Pressable
                key={option.id}
                type="button"
                intensity="soft"
                className={`practice-timeline-editor__chip ${section.subdivision === option.id ? 'practice-timeline-editor__chip--active' : ''}`}
                onClick={() => onChange({ subdivision: option.id })}
              >
                {option.label}
              </Pressable>
            ))}
          </div>
        </div>

        <div className="practice-timeline-editor__field">
          <span className="practice-timeline-editor__label">Accents</span>
          <p className="practice-timeline-editor__hint">Tap a beat to cycle: weak → medium → strong → silent</p>
          <SectionAccentEditor
            pulseCount={timing.pulseCount}
            accentLevels={accentLevels}
            onChange={(customAccents) =>
              onChange({
                advanced: {
                  ...section.advanced,
                  customAccents,
                  beatGrouping: section.advanced?.beatGrouping,
                },
              })
            }
          />
        </div>
          </>
        )}

        <div className="practice-timeline-editor__field">
          <span className="practice-timeline-editor__label">Repeat section</span>
          <div className="practice-timeline-editor__stepper">
            <Pressable
              type="button"
              intensity="icon"
              className="practice-timeline-editor__stepper-btn"
              onClick={() => onChange({ repeatCount: Math.max(1, section.repeatCount - 1) })}
            >
              −
            </Pressable>
            <span className="practice-timeline-editor__stepper-value">{repeatLabel(section.repeatCount)}</span>
            <Pressable
              type="button"
              intensity="icon"
              className="practice-timeline-editor__stepper-btn"
              onClick={() => onChange({ repeatCount: Math.min(16, section.repeatCount + 1) })}
            >
              +
            </Pressable>
          </div>
        </div>

        <Pressable
          type="button"
          intensity="soft"
          className="practice-timeline-editor__advanced-toggle"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? <ChevronUp size={16} className="mr-1 inline" /> : <ChevronDown size={16} className="mr-1 inline" />}
          More options
        </Pressable>

        {showAdvanced ? (
          <div className="practice-timeline-editor__field">
            <span className="practice-timeline-editor__label">Section count-in (bars)</span>
            <p className="practice-timeline-editor__hint">Overrides routine count-in for this section only.</p>
            <div className="practice-timeline-editor__stepper">
              <Pressable
                type="button"
                intensity="icon"
                className="practice-timeline-editor__stepper-btn"
                onClick={() =>
                  onChange({
                    advanced: {
                      ...section.advanced,
                      countInBars: Math.max(0, (section.advanced?.countInBars ?? 0) - 1),
                    },
                  })
                }
              >
                −
              </Pressable>
              <span className="practice-timeline-editor__stepper-value">
                {section.advanced?.countInBars ?? 0}
              </span>
              <Pressable
                type="button"
                intensity="icon"
                className="practice-timeline-editor__stepper-btn"
                onClick={() =>
                  onChange({
                    advanced: {
                      ...section.advanced,
                      countInBars: Math.min(8, (section.advanced?.countInBars ?? 0) + 1),
                    },
                  })
                }
              >
                +
              </Pressable>
            </div>

            <span className="practice-timeline-editor__label mt-4">Tempo change</span>
            <div className="practice-timeline-editor__chips">
              <Pressable
                type="button"
                intensity="soft"
                className={`practice-timeline-editor__chip ${section.advanced?.tempoRamp?.enabled ? 'practice-timeline-editor__chip--active' : ''}`}
                onClick={() =>
                  onChange({
                    advanced: {
                      ...section.advanced,
                      tempoRamp: {
                        enabled: !section.advanced?.tempoRamp?.enabled,
                        endBpm: section.advanced?.tempoRamp?.endBpm ?? section.bpm + 20,
                      },
                    },
                  })
                }
              >
                {section.advanced?.tempoRamp?.enabled ? rampLabel ?? 'On' : 'Off'}
              </Pressable>
            </div>

            {section.advanced?.tempoRamp?.enabled ? (
              <div className="practice-timeline-editor__stepper mt-3">
                <Pressable
                  type="button"
                  intensity="icon"
                  className="practice-timeline-editor__stepper-btn"
                  onClick={() =>
                    onChange({
                      advanced: {
                        ...section.advanced,
                        tempoRamp: {
                          enabled: true,
                          endBpm: Math.max(40, (section.advanced?.tempoRamp?.endBpm ?? section.bpm) - 1),
                        },
                      },
                    })
                  }
                >
                  −
                </Pressable>
                <span className="practice-timeline-editor__stepper-value">
                  {rampLabel ?? `→ ${section.advanced?.tempoRamp?.endBpm ?? section.bpm}`}
                </span>
                <Pressable
                  type="button"
                  intensity="icon"
                  className="practice-timeline-editor__stepper-btn"
                  onClick={() =>
                    onChange({
                      advanced: {
                        ...section.advanced,
                        tempoRamp: {
                          enabled: true,
                          endBpm: Math.min(300, (section.advanced?.tempoRamp?.endBpm ?? section.bpm) + 1),
                        },
                      },
                    })
                  }
                >
                  +
                </Pressable>
              </div>
            ) : null}

            <span className="practice-timeline-editor__label mt-4">Marker notes</span>
            <input
              className="practice-timeline-editor__input"
              value={section.advanced?.markerNotes ?? ''}
              onChange={(e) =>
                onChange({ advanced: { ...section.advanced, markerNotes: e.target.value } })
              }
              placeholder="Optional note"
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
