import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react'
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
import { createPatternStep, defaultPatternRepeat, formatPatternMetersLabel, sectionHasMeterPattern } from '../patternLogic'
import { repeatLabel } from '../sectionDefaults'
import {
  applyMeterChange,
  effectiveBars,
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

const REPEAT_OPTIONS = Array.from({ length: 16 }, (_, index) => ({
  value: String(index + 1), label: repeatLabel(index + 1),
}))

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
  const repeatOptions = section.repeatCount <= 16
    ? REPEAT_OPTIONS
    : Array.from({ length: section.repeatCount }, (_, index) => ({
        value: String(index + 1), label: repeatLabel(index + 1),
      }))
  const activeDetails = [
    isPatternMode ? 'Meter pattern' : null,
    section.pulseModeId ? 'Tempo beat' : null,
    section.feelId ? 'Beat feel' : null,
    section.subdivision !== 'auto' ? 'Custom clicks' : null,
    section.advanced?.tempoRamp?.enabled ? 'Tempo ramp' : null,
    section.advanced?.tempoMarkers?.length ? 'Tempo pins' : null,
    section.advanced?.customAccents?.length || section.advanced?.beatGrouping?.length ? 'Custom accents' : null,
    section.advanced?.countInBars ? 'Section count-in' : null,
    section.advanced?.markerNotes?.trim() ? 'Practice note' : null,
  ].filter((detail): detail is string => Boolean(detail))
  const moreSummary = activeDetails.length > 0
    ? activeDetails.slice(0, 2).join(' · ') + (activeDetails.length > 2 ? ` · +${activeDetails.length - 2}` : '')
    : 'Meter patterns · click rhythm · tempo changes'

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
          aria-label="Back to program"
        >
          <ArrowLeft size={21} />
        </Pressable>
        <span className="practice-timeline-editor__title">
          <strong>Edit section</strong>
        </span>
        <Pressable
          type="button"
          data-tutorial="practice-section-done"
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
          <section className="practice-timeline-editor__focus" aria-label="Section essentials">
            <label className="practice-timeline-editor__name-label" htmlFor="section-title">Section name</label>
            <input
              id="section-title"
              className="practice-timeline-editor__focus-name"
              value={section.title}
              onChange={(event) => onChange({ title: event.target.value })}
              placeholder="New Section"
            />

            {!isPatternMode ? (
              <>
                <div className="practice-timeline-editor__focus-tempo">
                  <span className="practice-timeline-editor__focus-tempo-label">Tempo <small>{timing.bpmSymbol} / minute</small></span>
                  <div className="practice-timeline-editor__stepper">
                    <Pressable type="button" intensity="icon" className="practice-timeline-editor__stepper-btn"
                      aria-label="Decrease tempo" onClick={() => onChange({ bpm: Math.max(40, section.bpm - 1) })}>−</Pressable>
                    <EditableNumberValue value={section.bpm} min={40} max={300}
                      ariaLabel="Type tempo" onCommit={(bpm) => onChange({ bpm })}
                      className="practice-timeline-editor__focus-bpm" />
                    <Pressable type="button" intensity="icon" className="practice-timeline-editor__stepper-btn"
                      aria-label="Increase tempo" onClick={() => onChange({ bpm: Math.min(300, section.bpm + 1) })}>+</Pressable>
                  </div>
                </div>
                <div className="practice-timeline-editor__essentials">
                  <div className="practice-timeline-editor__essential">
                    <span>Length</span>
                    <EditableNumberValue value={section.bars} min={1} max={128}
                      suffix={section.bars === 1 ? 'bar' : 'bars'} ariaLabel="Type section length in bars"
                      onCommit={(bars) => onChange({ bars })} />
                  </div>
                  <div className="practice-timeline-editor__essential">
                    <TimelineEditorSelect label="Time" ariaLabel="Time signature" value={section.meter}
                      options={meterSelectOptions()}
                      onChange={(meter) => {
                        setGroupingDraft('')
                        onChange(applyMeterChange(section, meter as MetronomeMeter))
                      }} />
                  </div>
                  <div className="practice-timeline-editor__essential">
                    <TimelineEditorSelect label="Repeat" ariaLabel="Repeat this section"
                      value={String(section.repeatCount)} options={repeatOptions}
                      onChange={(repeat) => onChange({ repeatCount: Number(repeat) })} />
                  </div>
                </div>
              </>
            ) : (
              <div className="practice-timeline-editor__essentials">
                <Pressable type="button" intensity="soft" className="practice-timeline-editor__pattern-summary"
                  onClick={() => setShowAdvanced(true)}>
                  <span>Meter pattern</span>
                  <strong>{formatPatternMetersLabel(section.patternSteps ?? [])}</strong>
                  <small>{effectiveBars(section)} bars · Edit in More settings</small>
                </Pressable>
                <div className="practice-timeline-editor__essential">
                  <TimelineEditorSelect label="Repeat" ariaLabel="Repeat this section"
                    value={String(section.repeatCount)} options={repeatOptions}
                    onChange={(repeat) => onChange({ repeatCount: Number(repeat) })} />
                </div>
              </div>
            )}
          </section>

          <Pressable
            type="button"
            intensity="soft"
            className="practice-timeline-editor__advanced-toggle"
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((visible) => !visible)}
          >
            <span className="practice-timeline-editor__advanced-copy">
              <strong>More settings</strong>
              <small>{moreSummary}</small>
            </span>
            {showAdvanced ? (
              <ChevronUp size={18} aria-hidden />
            ) : (
              <ChevronDown size={18} aria-hidden />
            )}
          </Pressable>

          {showAdvanced ? (
            <div className="practice-timeline-editor__advanced">
              <section className="practice-timeline-editor__group" aria-labelledby="section-format-heading">
                <div className="practice-timeline-editor__group-heading">
                  <div><h2 id="section-format-heading">Section format</h2></div>
                </div>
                <div className="practice-timeline-editor__select-grid">
                  <TimelineEditorSelect label="Format" ariaLabel="Section format"
                    value={isPatternMode ? 'pattern' : 'single'} options={SECTION_TYPE_OPTIONS}
                    onChange={handleSectionTypeChange} />
                </div>
                {isPatternMode ? <MeterPatternEditor section={section} onChange={onChange} /> : null}
                {!isPatternMode && (sectionNeedsPulseModeChoice(section) || sectionNeedsFeelPrompt(section)) ? (
                  <div className="practice-timeline-editor__select-grid">
                    {sectionNeedsPulseModeChoice(section) ? (
                      <TimelineEditorSelect label="Tempo counts" ariaLabel="Which note value the tempo refers to"
                        value={section.pulseModeId ?? timing.pulseModeId} options={pulseSelectOptions(pulseModes)}
                        onChange={(pulseModeId) => {
                          setGroupingDraft('')
                          onChange({ pulseModeId, feelId: undefined, subdivision: 'auto',
                            advanced: { ...section.advanced, beatGrouping: undefined, customAccents: undefined } })
                        }} />
                    ) : null}
                    {sectionNeedsFeelPrompt(section) && timing.feelOptions.length > 0 ? (
                      <TimelineEditorSelect label="Beat feel" ariaLabel="Beat grouping"
                        value={activeFeelId || timing.feelOptions[0]?.id}
                        options={feelSelectOptions(timing.feelOptions)}
                        onChange={(feelId) => {
                          setGroupingDraft('')
                          onChange({ feelId, advanced: { ...section.advanced,
                            beatGrouping: undefined, customAccents: undefined } })
                        }} />
                    ) : null}
                  </div>
                ) : null}
              </section>
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
