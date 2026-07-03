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
import { repeatLabel } from '../sectionDefaults'
import {
  applyMeterChange,
  pulseModeOptionsForSection,
  resolveSectionTiming,
  sectionNeedsFeelPrompt,
  sectionNeedsPulseModeChoice,
  subdivisionOptionsForSection,
} from '../timeSignatureLogic'
import {
  feelSelectOptions,
  meterSelectOptions,
  pulseSelectOptions,
  SECTION_TYPE_OPTIONS,
  subdivisionSelectOptions,
  type SectionTypeValue,
} from '../timelineEditorOptions'
import type { SectionSubdivision, TimelineSection } from '../types'
import MeterPatternEditor from './MeterPatternEditor'
import EditableNumberValue from './EditableNumberValue'
import SectionAccentEditor from './SectionAccentEditor'
import SectionTempoDepthPanel from './SectionTempoDepthPanel'
import TimelineEditorSelect from './TimelineEditorSelect'

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
  const isPatternMode = sectionHasMeterPattern(section)

  const enablePatternMode = () => {
    const steps = [createPatternStep(section.meter), createPatternStep('6/8')]
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

  const activeFeelId =
    section.feelId ??
    (section.advanced?.beatGrouping?.length ? '' : timing.feelOptions[0]?.id ?? '')

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

  const handleSectionTypeChange = (value: SectionTypeValue) => {
    if (value === 'pattern') enablePatternMode()
    else disablePatternMode()
  }

  return (
    <div className="practice-timeline-editor pointer-events-auto">
      <header className="practice-timeline-editor__header">
        <Pressable type="button" intensity="icon" onClick={onClose} aria-label="Close">
          <X size={22} />
        </Pressable>
        <span className="practice-timeline-editor__title">Section</span>
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

        <div className="practice-timeline-editor__select-grid">
          <TimelineEditorSelect
            label="Mode"
            ariaLabel="Section type"
            value={isPatternMode ? 'pattern' : 'single'}
            options={SECTION_TYPE_OPTIONS}
            onChange={handleSectionTypeChange}
          />
        </div>

        {isPatternMode ? (
          <MeterPatternEditor section={section} onChange={onChange} />
        ) : (
          <>
            <div className="practice-timeline-editor__field-row">
              <div className="practice-timeline-editor__field practice-timeline-editor__field--half">
                <span className="practice-timeline-editor__label">Bars</span>
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

              <div className="practice-timeline-editor__field practice-timeline-editor__field--half">
                <span className="practice-timeline-editor__label">Tempo ({timing.bpmSymbol})</span>
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
            </div>

            <div className="practice-timeline-editor__select-grid">
              <TimelineEditorSelect
                label="Time signature"
                ariaLabel="Time signature"
                value={section.meter}
                options={meterSelectOptions()}
                onChange={(meter) => onChange(applyMeterChange(section, meter as MetronomeMeter))}
              />

              {sectionNeedsPulseModeChoice(section) ? (
                <TimelineEditorSelect
                  label="Tempo counts"
                  ariaLabel="Which note value the tempo refers to"
                  value={section.pulseModeId ?? timing.pulseModeId}
                  options={pulseSelectOptions(pulseModes)}
                  onChange={(pulseModeId) =>
                    onChange({
                      pulseModeId,
                      feelId: undefined,
                      subdivision: 'auto',
                      advanced: {
                        ...section.advanced,
                        beatGrouping: undefined,
                        customAccents: undefined,
                      },
                    })
                  }
                />
              ) : null}

              {sectionNeedsFeelPrompt(section) && timing.feelOptions.length > 0 ? (
                <TimelineEditorSelect
                  label="Feel"
                  ariaLabel="Beat grouping"
                  value={activeFeelId || timing.feelOptions[0]?.id}
                  options={feelSelectOptions(timing.feelOptions)}
                  onChange={(feelId) => {
                    setGroupingDraft('')
                    onChange({
                      feelId,
                      advanced: {
                        ...section.advanced,
                        beatGrouping: undefined,
                        customAccents: undefined,
                      },
                    })
                  }}
                />
              ) : null}

            </div>
          </>
        )}

        <div className="practice-timeline-editor__field">
          <span className="practice-timeline-editor__label">Repeat</span>
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
          Fine tune
        </Pressable>

        {showAdvanced ? (
          <div className="practice-timeline-editor__advanced">
            {!isPatternMode ? (
              <>
                <div className="practice-timeline-editor__select-grid">
                  <TimelineEditorSelect
                    label="Extra clicks"
                    ariaLabel="Click subdivision"
                    value={section.subdivision}
                    options={subdivisionSelectOptions(subdivisionChoices)}
                    onChange={(subdivision) => onChange({ subdivision })}
                  />
                </div>

                <div className="practice-timeline-editor__field">
                  <span className="practice-timeline-editor__label">Custom feel</span>
                  <input
                    className="practice-timeline-editor__input"
                    value={groupingDraft}
                    onChange={(e) => applyCustomGrouping(e.target.value)}
                    placeholder="2+2+3"
                    inputMode="text"
                  />
                  <p className="practice-timeline-editor__hint">{groupingValidationMessage(section)}</p>
                </div>

                <div className="practice-timeline-editor__field">
                  <span className="practice-timeline-editor__label">Accents</span>
                  <p className="practice-timeline-editor__hint">Tap beats to change accents.</p>
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
            ) : null}

            <div className="practice-timeline-editor__field">
              <span className="practice-timeline-editor__label">Count-in</span>
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
            </div>

            <SectionTempoDepthPanel section={section} onChange={onChange} />

            <div className="practice-timeline-editor__field">
              <span className="practice-timeline-editor__label">Notes</span>
              <input
                className="practice-timeline-editor__input"
                value={section.advanced?.markerNotes ?? ''}
                onChange={(e) =>
                  onChange({ advanced: { ...section.advanced, markerNotes: e.target.value } })
                }
                placeholder="Optional note"
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
