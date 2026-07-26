import { ArrowLeft, ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { MetronomeMeter, MetronomeSubdivision } from '../../utils/metronomeConfig'
import Pressable from '../../components/ui/Pressable'
import {
  formatGrouping,
  groupingExample,
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
  const [showAdvanced, setShowAdvanced] = useState(() => {
    const advanced = section.advanced
    return Boolean(
      advanced?.beatGrouping?.length ||
        advanced?.customAccents?.length ||
        advanced?.countInBars ||
        advanced?.tempoRamp?.enabled ||
        advanced?.tempoMarkers?.length ||
        advanced?.markerNotes
    )
  })
  const [groupingDraft, setGroupingDraft] = useState(() =>
    section.advanced?.beatGrouping?.length ? formatGrouping(section.advanced.beatGrouping) : ''
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

  const accentLevels = section.advanced?.customAccents?.length
    ? section.advanced.customAccents
    : timing.accentLevels

  const activeFeelId =
    section.feelId ??
    (section.advanced?.beatGrouping?.length ? '' : timing.feelOptions[0]?.id ?? '')
  const parsedGrouping = parseGroupingInput(groupingDraft)
  const groupingInvalid =
    Boolean(groupingDraft.trim()) &&
    (!parsedGrouping || !validateGroupingForMeter(parsedGrouping, section))
  const groupingPlaceholder = groupingExample(section)

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
        <Pressable
          type="button"
          intensity="icon"
          className="practice-timeline-editor__back"
          onClick={onClose}
          aria-label="Back to routine"
        >
          <ArrowLeft size={21} />
        </Pressable>
        <span className="practice-timeline-editor__title">
          <small>Edit section</small>
          <strong>{section.title.trim() || 'Untitled section'}</strong>
        </span>
        <Pressable
          type="button"
          intensity="soft"
          haptic="success"
          className="practice-timeline-editor__done"
          onClick={onClose}
        >
          Done
        </Pressable>
      </header>

      <div className="practice-timeline-editor__body">
        <div className="practice-timeline-editor__content">
          <section
            className="practice-timeline-editor__group"
            aria-labelledby="section-basics-heading"
          >
            <div className="practice-timeline-editor__group-heading">
              <div>
                <h2 id="section-basics-heading">Basics</h2>
                <p>Name the section and choose how its meter behaves.</p>
              </div>
            </div>

            <div className="practice-timeline-editor__field">
              <label className="practice-timeline-editor__label" htmlFor="section-title">
                Section name
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
                label="Section format"
                ariaLabel="Section format"
                value={isPatternMode ? 'pattern' : 'single'}
                options={SECTION_TYPE_OPTIONS}
                onChange={handleSectionTypeChange}
              />
            </div>
          </section>

          <section
            className="practice-timeline-editor__group"
            aria-labelledby="section-timing-heading"
          >
            <div className="practice-timeline-editor__group-heading">
              <div>
                <h2 id="section-timing-heading">{isPatternMode ? 'Meter pattern' : 'Timing'}</h2>
                <p>
                  {isPatternMode
                    ? 'Build the sequence of time signatures.'
                    : 'Set the section length, tempo, and time signature.'}
                </p>
              </div>
            </div>

            {isPatternMode ? (
              <MeterPatternEditor section={section} onChange={onChange} />
            ) : (
              <>
                <div className="practice-timeline-editor__field practice-timeline-editor__field--control">
                  <span className="practice-timeline-editor__label">Bars</span>
                  <div className="practice-timeline-editor__stepper">
                    <Pressable
                      type="button"
                      intensity="icon"
                      className="practice-timeline-editor__stepper-btn"
                      aria-label="Decrease bars"
                      onClick={() => onChange({ bars: Math.max(1, section.bars - 1) })}
                    >
                      −
                    </Pressable>
                    <span className="practice-timeline-editor__stepper-value">
                      {section.bars}
                      <span className="practice-timeline-editor__stepper-value-suffix">
                        {section.bars === 1 ? 'bar' : 'bars'}
                      </span>
                    </span>
                    <Pressable
                      type="button"
                      intensity="icon"
                      className="practice-timeline-editor__stepper-btn"
                      aria-label="Increase bars"
                      onClick={() => onChange({ bars: Math.min(128, section.bars + 1) })}
                    >
                      +
                    </Pressable>
                  </div>
                </div>

                <div className="practice-timeline-editor__field practice-timeline-editor__field--control">
                  <span className="practice-timeline-editor__label">
                    Tempo ({timing.bpmSymbol})
                  </span>
                  <div className="practice-timeline-editor__stepper">
                    <Pressable
                      type="button"
                      intensity="icon"
                      className="practice-timeline-editor__stepper-btn"
                      aria-label="Decrease tempo"
                      onClick={() => onChange({ bpm: Math.max(40, section.bpm - 1) })}
                    >
                      −
                    </Pressable>
                    <EditableNumberValue
                      value={section.bpm}
                      min={40}
                      max={300}
                      suffix="BPM"
                      ariaLabel="Type tempo"
                      onCommit={(bpm) => onChange({ bpm })}
                    />
                    <Pressable
                      type="button"
                      intensity="icon"
                      className="practice-timeline-editor__stepper-btn"
                      aria-label="Increase tempo"
                      onClick={() => onChange({ bpm: Math.min(300, section.bpm + 1) })}
                    >
                      +
                    </Pressable>
                  </div>
                </div>

                <div className="practice-timeline-editor__select-grid">
                  <TimelineEditorSelect
                    label="Time signature"
                    ariaLabel="Time signature"
                    value={section.meter}
                    options={meterSelectOptions()}
                    onChange={(meter) => {
                      setGroupingDraft('')
                      onChange(applyMeterChange(section, meter as MetronomeMeter))
                    }}
                  />

                  {sectionNeedsPulseModeChoice(section) ? (
                    <TimelineEditorSelect
                      label="Tempo counts"
                      ariaLabel="Which note value the tempo refers to"
                      value={section.pulseModeId ?? timing.pulseModeId}
                      options={pulseSelectOptions(pulseModes)}
                      onChange={(pulseModeId) => {
                        setGroupingDraft('')
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
                      }}
                    />
                  ) : null}

                  {sectionNeedsFeelPrompt(section) && timing.feelOptions.length > 0 ? (
                    <TimelineEditorSelect
                      label="Beat feel"
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

            <div className="practice-timeline-editor__field practice-timeline-editor__field--control practice-timeline-editor__field--last">
              <span className="practice-timeline-editor__label">Repeat this section</span>
              <div className="practice-timeline-editor__stepper">
                <Pressable
                  type="button"
                  intensity="icon"
                  className="practice-timeline-editor__stepper-btn"
                  aria-label="Decrease repeats"
                  onClick={() =>
                    onChange({
                      repeatCount: Math.max(1, section.repeatCount - 1),
                    })
                  }
                >
                  −
                </Pressable>
                <span className="practice-timeline-editor__stepper-value">
                  {repeatLabel(section.repeatCount)}
                </span>
                <Pressable
                  type="button"
                  intensity="icon"
                  className="practice-timeline-editor__stepper-btn"
                  aria-label="Increase repeats"
                  onClick={() =>
                    onChange({
                      repeatCount: Math.min(16, section.repeatCount + 1),
                    })
                  }
                >
                  +
                </Pressable>
              </div>
            </div>
          </section>

          <Pressable
            type="button"
            intensity="soft"
            className="practice-timeline-editor__advanced-toggle"
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((visible) => !visible)}
          >
            <span className="practice-timeline-editor__advanced-icon" aria-hidden>
              <SlidersHorizontal size={18} />
            </span>
            <span className="practice-timeline-editor__advanced-copy">
              <strong>Advanced timing</strong>
              <small>Clicks, accents, count-in, tempo changes, and notes</small>
            </span>
            {showAdvanced ? (
              <ChevronUp size={18} aria-hidden />
            ) : (
              <ChevronDown size={18} aria-hidden />
            )}
          </Pressable>

          {showAdvanced ? (
            <div className="practice-timeline-editor__advanced">
              <section
                className="practice-timeline-editor__group"
                aria-labelledby="section-rhythm-detail-heading"
              >
                <div className="practice-timeline-editor__group-heading">
                  <div>
                    <h2 id="section-rhythm-detail-heading">Rhythm details</h2>
                    <p>Shape the click pattern for this section.</p>
                  </div>
                </div>

                {!isPatternMode ? (
                  <>
                    <div className="practice-timeline-editor__select-grid">
                      <TimelineEditorSelect
                        label="Clicks between beats"
                        ariaLabel="Click subdivision"
                        value={section.subdivision}
                        options={subdivisionSelectOptions(subdivisionChoices)}
                        onChange={(subdivision) => onChange({ subdivision })}
                      />
                    </div>

                    <div className="practice-timeline-editor__field">
                      <label
                        className="practice-timeline-editor__label"
                        htmlFor="section-custom-feel"
                      >
                        Custom beat grouping
                      </label>
                      <input
                        id="section-custom-feel"
                        className="practice-timeline-editor__input"
                        value={groupingDraft}
                        onChange={(event) => applyCustomGrouping(event.target.value)}
                        placeholder={groupingPlaceholder}
                        inputMode="text"
                        aria-invalid={groupingInvalid}
                        aria-describedby="section-custom-feel-help"
                      />
                      <p
                        id="section-custom-feel-help"
                        className={`practice-timeline-editor__hint ${
                          groupingInvalid ? 'practice-timeline-editor__hint--error' : ''
                        }`}
                      >
                        {groupingValidationMessage(section)}
                      </p>
                    </div>

                    <div className="practice-timeline-editor__field">
                      <span className="practice-timeline-editor__label">Beat accents</span>
                      <p className="practice-timeline-editor__hint">
                        Tap a beat to cycle through strong, medium, weak, and silent.
                      </p>
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

                <div className="practice-timeline-editor__field practice-timeline-editor__field--control practice-timeline-editor__field--last">
                  <span className="practice-timeline-editor__label">Section count-in</span>
                  <p className="practice-timeline-editor__hint">
                    Add a lead-in before this section begins.
                  </p>
                  <div className="practice-timeline-editor__stepper">
                    <Pressable
                      type="button"
                      intensity="icon"
                      className="practice-timeline-editor__stepper-btn"
                      aria-label="Decrease section count-in"
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
                      {(section.advanced?.countInBars ?? 0) <= 0
                        ? 'Off'
                        : `${section.advanced?.countInBars} ${
                            section.advanced?.countInBars === 1 ? 'bar' : 'bars'
                          }`}
                    </span>
                    <Pressable
                      type="button"
                      intensity="icon"
                      className="practice-timeline-editor__stepper-btn"
                      aria-label="Increase section count-in"
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
              </section>

              <SectionTempoDepthPanel section={section} onChange={onChange} />

              <section
                className="practice-timeline-editor__group"
                aria-labelledby="section-notes-heading"
              >
                <div className="practice-timeline-editor__group-heading">
                  <div>
                    <h2 id="section-notes-heading">Practice note</h2>
                    <p>Add a reminder to read when this section starts.</p>
                  </div>
                </div>
                <div className="practice-timeline-editor__field practice-timeline-editor__field--last">
                  <label className="practice-timeline-editor__label" htmlFor="section-notes">
                    Note
                  </label>
                  <textarea
                    id="section-notes"
                    rows={3}
                    className="practice-timeline-editor__input practice-timeline-editor__textarea"
                    value={section.advanced?.markerNotes ?? ''}
                    onChange={(event) =>
                      onChange({
                        advanced: {
                          ...section.advanced,
                          markerNotes: event.target.value,
                        },
                      })
                    }
                    placeholder="Example: Keep the right hand relaxed"
                  />
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
