import { AlertTriangle, Plus, Trash2, X } from 'lucide-react'
import { useMemo } from 'react'
import type { MetronomeMeter } from '../../utils/metronomeConfig'
import Pressable from '../../components/ui/Pressable'
import { COMMON_METERS } from '../sectionDefaults'
import { oddMeterGroupingOptions } from '../scan/oddMeterGroupings'
import { draftSectionBars } from '../scan/scanToProgram'
import type { MusicScanApplyMode, MusicScanDraftProgram, MusicScanDraftSection } from '../scan/musicScanTypes'
import { formatGrouping } from '../groupingUtils'

interface MusicScanReviewSheetProps {
  draft: MusicScanDraftProgram
  onChange: (draft: MusicScanDraftProgram) => void
  onClose: () => void
  onApply: (mode: MusicScanApplyMode) => void
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.85) return 'High'
  if (confidence >= 0.6) return 'Medium'
  return 'Low'
}

function updateSection(
  draft: MusicScanDraftProgram,
  sectionId: string,
  patch: Partial<MusicScanDraftSection>,
): MusicScanDraftProgram {
  return {
    ...draft,
    sections: draft.sections.map((section) =>
      section.id === sectionId ? { ...section, ...patch, uncertain: false } : section,
    ),
  }
}

function DraftSectionCard({
  section,
  index,
  onChange,
  onDelete,
}: {
  section: MusicScanDraftSection
  index: number
  onChange: (patch: Partial<MusicScanDraftSection>) => void
  onDelete: () => void
}) {
  const bars = draftSectionBars(section)
  const groupingOptions = oddMeterGroupingOptions(section.meter)

  return (
    <article
      className={`music-scan-review__card ${section.uncertain ? 'music-scan-review__card--uncertain' : ''}`}
    >
      <header className="music-scan-review__card-header">
        <div className="min-w-0 flex-1">
          <input
            className="music-scan-review__title-input"
            value={section.title}
            onChange={(e) => onChange({ title: e.target.value })}
            aria-label={`Section ${index + 1} title`}
          />
          <p className="music-scan-review__card-meta">
            m.{section.startMeasure}–{section.endMeasure} · {bars} bars ·{' '}
            <span className={section.uncertain ? 'music-scan-review__uncertain' : ''}>
              {confidenceLabel(section.confidence)} confidence
            </span>
            {section.uncertain ? (
              <>
                {' '}
                <AlertTriangle size={14} className="inline text-amber-500" aria-hidden />
              </>
            ) : null}
          </p>
        </div>
        <Pressable type="button" intensity="icon" onClick={onDelete} aria-label="Delete section">
          <Trash2 size={18} />
        </Pressable>
      </header>

      <div className="music-scan-review__grid">
        <label className="music-scan-review__field">
          <span>Start m.</span>
          <input
            type="number"
            min={1}
            value={section.startMeasure}
            onChange={(e) => onChange({ startMeasure: Number(e.target.value) })}
          />
        </label>
        <label className="music-scan-review__field">
          <span>End m.</span>
          <input
            type="number"
            min={section.startMeasure}
            value={section.endMeasure}
            onChange={(e) => onChange({ endMeasure: Number(e.target.value) })}
          />
        </label>
        <label className="music-scan-review__field">
          <span>Tempo</span>
          <input
            type="number"
            min={40}
            max={300}
            value={section.bpm}
            onChange={(e) => onChange({ bpm: Number(e.target.value) })}
          />
        </label>
        <label className="music-scan-review__field">
          <span>Repeats</span>
          <input
            type="number"
            min={1}
            max={16}
            value={section.repeatCount}
            onChange={(e) => onChange({ repeatCount: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="music-scan-review__chips">
        {COMMON_METERS.map((meter) => (
          <Pressable
            key={meter}
            type="button"
            intensity="soft"
            className={`practice-timeline-editor__chip ${section.meter === meter ? 'practice-timeline-editor__chip--active' : ''}`}
            onClick={() => onChange({ meter: meter as MetronomeMeter, feelId: undefined, beatGrouping: undefined })}
          >
            {meter}
          </Pressable>
        ))}
      </div>

      {groupingOptions.length > 0 ? (
        <div className="music-scan-review__grouping">
          <span className="music-scan-review__label">Grouping</span>
          <div className="music-scan-review__chips">
            {groupingOptions.map((option) => (
              <Pressable
                key={option.id}
                type="button"
                intensity="soft"
                className={`practice-timeline-editor__chip ${
                  section.feelId === option.id ||
                  (section.beatGrouping && formatGrouping(section.beatGrouping) === option.label)
                    ? 'practice-timeline-editor__chip--active'
                    : ''
                }`}
                onClick={() =>
                  onChange({ feelId: option.id, beatGrouping: option.grouping })
                }
              >
                {option.label}
              </Pressable>
            ))}
          </div>
        </div>
      ) : null}

      <div className="music-scan-review__flags">
        <label className="music-scan-review__check">
          <input
            type="checkbox"
            checked={section.pickupMeasure}
            onChange={(e) => onChange({ pickupMeasure: e.target.checked })}
          />
          Pickup measure
        </label>
        <label className="music-scan-review__check">
          <input
            type="checkbox"
            checked={section.tempoRamp?.enabled ?? false}
            onChange={(e) =>
              onChange({
                tempoRamp: {
                  enabled: e.target.checked,
                  endBpm: section.tempoRamp?.endBpm ?? section.bpm + (e.target.checked ? 20 : 0),
                },
              })
            }
          />
          Rit / Accel
        </label>
        {section.tempoRamp?.enabled ? (
          <label className="music-scan-review__field music-scan-review__field--inline">
            <span>End BPM</span>
            <input
              type="number"
              min={40}
              max={300}
              value={section.tempoRamp.endBpm}
              onChange={(e) =>
                onChange({
                  tempoRamp: { enabled: true, endBpm: Number(e.target.value) },
                })
              }
            />
          </label>
        ) : null}
      </div>

      {section.repeatBlock ? (
        <p className="music-scan-review__note">
          Repeat detected: m.{section.repeatBlock.fromMeasure}–{section.repeatBlock.toMeasure} ×
          {section.repeatBlock.times}
          {section.repeatBlock.uncertain ? ' (uncertain)' : ''}
        </p>
      ) : null}

      {section.endings.length > 0 ? (
        <p className="music-scan-review__note">
          Endings:{' '}
          {section.endings.map((ending) => `${ending.label} [${ending.measures.join(', ')}]`).join('; ')}
        </p>
      ) : null}

      {section.navigation.length > 0 ? (
        <p className="music-scan-review__note">
          Navigation:{' '}
          {section.navigation
            .map((nav) => `${nav.type}${nav.targetMeasure ? `→m.${nav.targetMeasure}` : ''}`)
            .join(', ')}
        </p>
      ) : null}

      {section.notes ? <p className="music-scan-review__note">{section.notes}</p> : null}
    </article>
  )
}

export default function MusicScanReviewSheet({
  draft,
  onChange,
  onClose,
  onApply,
}: MusicScanReviewSheetProps) {
  const uncertainCount = useMemo(
    () =>
      draft.sections.filter((section) => section.uncertain).length +
      draft.tempoEvents.filter((event) => event.uncertain).length +
      draft.meterEvents.filter((event) => event.uncertain).length,
    [draft],
  )

  const addSection = () => {
    const last = draft.sections[draft.sections.length - 1]
    const start = last ? last.endMeasure + 1 : 1
    const newSection: MusicScanDraftSection = {
      id: `scan-section-${Date.now()}`,
      title: `Section ${draft.sections.length + 1}`,
      startMeasure: start,
      endMeasure: start + 3,
      meter: '4/4',
      bpm: 80,
      subdivision: 'auto',
      repeatCount: 1,
      pickupMeasure: false,
      endings: [],
      navigation: [],
      confidence: 1,
      uncertain: false,
      sourcePages: [],
    }
    onChange({ ...draft, sections: [...draft.sections, newSection] })
  }

  return (
    <div className="music-scan-review pointer-events-auto">
      <header className="music-scan-review__header">
        <Pressable type="button" intensity="icon" onClick={onClose} aria-label="Cancel review">
          <X size={22} />
        </Pressable>
        <div className="min-w-0 flex-1 text-center">
          <h2 className="music-scan-review__title">Review Scan</h2>
          <p className="music-scan-review__subtitle">{draft.title}</p>
        </div>
        <div className="w-[44px]" />
      </header>

      <div className="music-scan-review__body">
        {draft.usedDemoParser ? (
          <p className="music-scan-review__banner">Demo parser — configure a vision API for real scans.</p>
        ) : null}

        {uncertainCount > 0 ? (
          <p className="music-scan-review__banner music-scan-review__banner--warn">
            <AlertTriangle size={16} className="mr-1 inline" aria-hidden />
            {uncertainCount} uncertain detection{uncertainCount === 1 ? '' : 's'} — please verify.
          </p>
        ) : null}

        {draft.warnings.map((warning) => (
          <p key={warning} className="music-scan-review__warning">
            {warning}
          </p>
        ))}

        {draft.tempoEvents.length > 0 ? (
          <section className="music-scan-review__events">
            <h3>Tempo events</h3>
            <ul>
              {draft.tempoEvents.map((event) => (
                <li key={event.id} className={event.uncertain ? 'music-scan-review__uncertain' : ''}>
                  m.{event.measure}: {event.marking ?? event.bpm} BPM
                  {event.uncertain ? ' (?)' : ''}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {draft.meterEvents.length > 0 ? (
          <section className="music-scan-review__events">
            <h3>Meter changes</h3>
            <ul>
              {draft.meterEvents.map((event) => (
                <li key={event.id} className={event.uncertain ? 'music-scan-review__uncertain' : ''}>
                  m.{event.measure}: {event.meter}
                  {event.feelLabel ? ` (${event.feelLabel})` : ''}
                  {event.uncertain ? ' (?)' : ''}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {draft.sections.map((section, index) => (
          <DraftSectionCard
            key={section.id}
            section={section}
            index={index}
            onChange={(patch) => onChange(updateSection(draft, section.id, patch))}
            onDelete={() =>
              onChange({ ...draft, sections: draft.sections.filter((s) => s.id !== section.id) })
            }
          />
        ))}

        <Pressable type="button" intensity="soft" className="music-scan-review__add" onClick={addSection}>
          <Plus size={18} className="mr-1 inline" />
          Add section
        </Pressable>
      </div>

      <footer className="music-scan-review__footer">
        <Pressable
          type="button"
          intensity="soft"
          className="practice-timeline__footer-btn practice-timeline__footer-btn--secondary"
          onClick={() => onApply('append')}
        >
          Append
        </Pressable>
        <Pressable
          type="button"
          intensity="normal"
          haptic="success"
          className="practice-timeline__footer-btn practice-timeline__footer-btn--primary"
          onClick={() => onApply('replace')}
        >
          Apply Program
        </Pressable>
      </footer>
    </div>
  )
}
