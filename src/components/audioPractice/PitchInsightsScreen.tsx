import { AnimatePresence, motion } from 'framer-motion'
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  Minus,
  RotateCcw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useActionSheet } from '../../context/ActionSheetContext'
import {
  clearPitchObservations,
  deletePitchObservationsInRange,
  listPitchObservations,
  PITCH_INSIGHTS_UPDATED_EVENT,
  type PitchInsightsUpdatedDetail,
  type PitchObservation,
} from '../../db/pitchInsightsRepository'
import {
  aggregatePitchInsights,
  describePitchInsight,
  localPracticeDayBounds,
  PITCH_INSIGHTS_THRESHOLDS,
  summarizePitchPracticeDays,
  type NotePitchInsight,
  type PitchPracticeDaySummary,
  type PitchPracticeSessionSummary,
} from '../../utils/pitchInsightsAnalytics'
import { triggerLightHaptic } from '../../utils/haptics'
import { iosSpringSnappy } from '../../utils/motionPresets'
import { TUNER_INSTRUMENTS, getTunerProfile, type TunerInstrument } from '../../utils/pitchConfig'
import {
  getTunerTransposition,
  type TunerTranspositionId,
} from '../../utils/tunerTransposition'
import AnimatedBottomSheet from '../ui/AnimatedBottomSheet'
import Pressable from '../ui/Pressable'

interface PitchInsightsScreenProps {
  isOpen: boolean
  onClose: () => void
  transpositionId?: TunerTranspositionId
  /** Instrument currently active in the tuner — used as the default filter
   * when the recorded history spans more than one instrument category. */
  tunerInstrument?: TunerInstrument
  formatNoteName?: (midiNote: number, fallback: string) => string
  hapticFeedback?: boolean
}

interface CentsGraphPoint {
  id: string
  timestamp: number
  cents: number
}

const DAY_PREVIEW_COUNT = 6
const GRAPH_POINT_LIMIT = 160

const CHROMATIC_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})
const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})
const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'short' })
const dayNumberFormatter = new Intl.DateTimeFormat(undefined, { day: 'numeric' })
const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

function formatCents(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const rounded = Math.round(value)
  if (rounded === 0) return '0¢'
  return `${rounded > 0 ? '+' : ''}${rounded}¢`
}

function formatDayHeading(day: PitchPracticeDaySummary): string {
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const yesterdayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - 1,
  ).getTime()
  if (day.startAt === todayStart) return 'Today'
  if (day.startAt === yesterdayStart) return 'Yesterday'
  return shortDateFormatter.format(day.startAt)
}

function sessionTimeRange(startedAt: number, endedAt: number): string {
  const start = timeFormatter.format(startedAt)
  const end = timeFormatter.format(endedAt)
  return start === end ? start : `${start} – ${end}`
}

const WARM_UP_WINDOW_MS = 5 * 60 * 1000
const WARM_UP_MIN_EARLY_OBSERVATIONS = 6
const WARM_UP_MIN_DRIFT_CENTS = 5

/**
 * Wind and brass air columns play flat when cold and sharpen as they warm —
 * real acoustic physics (speed of sound rises with temperature), not a
 * playing habit. Flags sessions with a clear upward drift in the first few
 * minutes so that drift isn't mistaken for an intonation tendency. Silent
 * for voice/strings, where this specific physical effect doesn't apply, and
 * silent whenever there isn't enough early data to say anything.
 */
function describeWarmUpDrift(session: PitchPracticeSessionSummary): string | null {
  const tunerInstrument = session.observations[0]?.tunerInstrument
  if (tunerInstrument !== 'winds') return null

  const windowEnd = session.startedAt + WARM_UP_WINDOW_MS
  const early = session.observations.filter((observation) => observation.observedAt <= windowEnd)
  if (early.length < WARM_UP_MIN_EARLY_OBSERVATIONS) return null

  const half = Math.floor(early.length / 2)
  const firstHalfMedian = median(early.slice(0, half).map((observation) => observation.centsOffset))
  const secondHalfMedian = median(early.slice(half).map((observation) => observation.centsOffset))
  const drift = secondHalfMedian - firstHalfMedian

  if (drift < WARM_UP_MIN_DRIFT_CENTS) return null
  return `Sharpened ~${Math.round(drift)}¢ over the first few minutes — likely the instrument warming up, not a habit.`
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/**
 * Standard error of the median (spread / √n) — a real, computable margin
 * rather than a label. Needs at least a few observations to mean anything;
 * below that, dispersion is too noisy to quote a number, so we say so
 * instead of printing a fabricated ±0¢.
 */
function marginOfErrorCents(insight: NotePitchInsight): number | null {
  if (insight.observationCount < PITCH_INSIGHTS_THRESHOLDS.earlyTendencyObservations) return null
  return insight.typicalVariability / Math.sqrt(insight.observationCount)
}

function confidenceLabel(insight: NotePitchInsight): string {
  const margin = marginOfErrorCents(insight)
  if (margin == null) {
    return `${plural(insight.observationCount, 'observation')} — too early to tell`
  }
  return `±${Math.round(margin)}¢ margin · ${plural(insight.observationCount, 'observation')}`
}

/** Same statistic as confidenceLabel without repeating the observation
 * count, for spots that already show the count as a standalone number. */
function marginLabel(insight: NotePitchInsight): string {
  const margin = marginOfErrorCents(insight)
  return margin == null ? 'Too early to tell' : `±${Math.round(margin)}¢ margin`
}

function tendencyLabel(insight: NotePitchInsight): string {
  if (insight.confidence === 'collecting') return 'Collecting data'
  if (insight.consistency !== 'Variable') return insight.tendency
  return insight.tendency === 'Centered'
    ? 'Variable around center'
    : `${insight.tendency} · variable`
}

function AccuracyHeader({ observations }: { observations: PitchObservation[] }) {
  const total = observations.length
  if (total === 0) return null

  let inTune = 0
  let flat = 0
  let sharp = 0
  for (const obs of observations) {
    if (Math.abs(obs.centsOffset) <= 3) inTune++
    else if (obs.centsOffset < -3) flat++
    else sharp++
  }

  const inTunePct = Math.round((inTune / total) * 100)
  const flatPct = Math.round((flat / total) * 100)
  const sharpPct = Math.max(0, 100 - inTunePct - flatPct)

  return (
    <section className="pitch-insights-accuracy">
      <div className="pitch-insights-accuracy__score">
        <div>
          <span className="pitch-insights-accuracy__kicker">Intonation Accuracy</span>
          <h2 className="pitch-insights-accuracy__value">
            {inTunePct}% <small>In-Tune Rate</small>
          </h2>
        </div>
        <div className="pitch-insights-accuracy__counts">
          <span className="is-in-tune">{inTune} centered</span>
          <span className="is-flat">{flat} flat</span>
          <span className="is-sharp">{sharp} sharp</span>
        </div>
      </div>
      <div className="pitch-insights-accuracy__bar" aria-hidden>
        <div
          className="pitch-insights-accuracy__seg is-in-tune"
          style={{ width: `${inTunePct}%` }}
          title={`${inTunePct}% In-Tune`}
        />
        <div
          className="pitch-insights-accuracy__seg is-flat"
          style={{ width: `${flatPct}%` }}
          title={`${flatPct}% Flat`}
        />
        <div
          className="pitch-insights-accuracy__seg is-sharp"
          style={{ width: `${sharpPct}%` }}
          title={`${sharpPct}% Sharp`}
        />
      </div>
    </section>
  )
}

function octaveForMidi(midiNote: number): number {
  return Math.floor(midiNote / 12) - 1
}

const REGISTER_PATTERN_THRESHOLD_CENTS = 4

/**
 * Looks for the classic register-break signature — one end of the range
 * consistently flat, the other consistently sharp — which a pitch-class-only
 * view can hide entirely (a note that's flat low and sharp high averages out
 * looking centered). Only speaks up when the split is real; otherwise silent.
 */
function describeRegisterPattern(insights: NotePitchInsight[]): string | null {
  const centsByOctave = new Map<number, number[]>()
  for (const insight of insights) {
    if (insight.confidence === 'collecting') continue
    const octave = octaveForMidi(insight.midiNote)
    const list = centsByOctave.get(octave) ?? []
    list.push(insight.typicalCents)
    centsByOctave.set(octave, list)
  }
  const octaves = [...centsByOctave.keys()].sort((left, right) => left - right)
  if (octaves.length < 2) return null

  const lowMedian = median(centsByOctave.get(octaves[0]!)!)
  const highMedian = median(centsByOctave.get(octaves[octaves.length - 1]!)!)

  if (
    lowMedian < -REGISTER_PATTERN_THRESHOLD_CENTS &&
    highMedian > REGISTER_PATTERN_THRESHOLD_CENTS
  ) {
    return 'Low register runs flat, top register runs sharp — worth a look as you move through your range.'
  }
  if (
    lowMedian > REGISTER_PATTERN_THRESHOLD_CENTS &&
    highMedian < -REGISTER_PATTERN_THRESHOLD_CENTS
  ) {
    return 'Top register runs flat, low register runs sharp — the reverse of the usual pattern.'
  }
  return null
}

function ChromaticPitchMatrix({
  insights,
  selectedPitchClass,
  onSelectPitchClass,
  onSelectMidiNote,
  hapticFeedback,
}: {
  insights: NotePitchInsight[]
  selectedPitchClass: number | null
  onSelectPitchClass: (pitchClass: number | null) => void
  onSelectMidiNote: (midiNote: number) => void
  hapticFeedback: boolean
}) {
  const cellByKey = useMemo(() => {
    const map = new Map<string, NotePitchInsight>()
    for (const insight of insights) {
      if (insight.observationCount === 0) continue
      map.set(`${octaveForMidi(insight.midiNote)}:${insight.midiNote % 12}`, insight)
    }
    return map
  }, [insights])

  const octaves = useMemo(() => {
    const present = [
      ...new Set(
        insights
          .filter((insight) => insight.observationCount > 0)
          .map((insight) => octaveForMidi(insight.midiNote)),
      ),
    ]
    if (present.length === 0) return [4]
    return present.sort((left, right) => right - left)
  }, [insights])

  const registerNote = useMemo(() => describeRegisterPattern(insights), [insights])

  return (
    <section className="pitch-insights-chromatic">
      <header className="pitch-insights-chromatic__header">
        <div>
          <span>Register Map</span>
          <strong>By octave</strong>
        </div>
        {selectedPitchClass !== null ? (
          <button
            type="button"
            className="pitch-insights-chromatic__clear"
            onClick={() => {
              triggerLightHaptic(hapticFeedback)
              onSelectPitchClass(null)
            }}
          >
            <Filter aria-hidden /> Reset filter ({CHROMATIC_NOTE_NAMES[selectedPitchClass]})
          </button>
        ) : (
          <small>Letter filters, cell opens the note</small>
        )}
      </header>

      <div className="pitch-insights-chromatic__body">
        <div className="pitch-insights-chromatic__octaves" aria-hidden>
          {octaves.map((octave) => (
            <span key={octave}>{octave}</span>
          ))}
        </div>
        <div className="pitch-insights-chromatic__rows">
          {octaves.map((octave) => (
            <div className="pitch-insights-chromatic__row" key={octave}>
              {CHROMATIC_NOTE_NAMES.map((name, pitchClass) => {
                const insight = cellByKey.get(`${octave}:${pitchClass}`)
                const hasData = Boolean(insight)
                const cents = insight?.typicalCents ?? 0
                const isDimmed = selectedPitchClass !== null && selectedPitchClass !== pitchClass
                const statusClass = !hasData
                  ? 'is-unplayed'
                  : Math.abs(cents) <= 3
                    ? 'is-centered'
                    : cents < -3
                      ? 'is-flat'
                      : 'is-sharp'

                const label = hasData
                  ? `${name}${octave}: ${formatCents(cents)} (${plural(insight!.observationCount, 'note')})`
                  : `${name}${octave}: No data`

                return (
                  <button
                    key={name}
                    type="button"
                    className={`pitch-insights-chromatic__cell ${statusClass} ${
                      selectedPitchClass === pitchClass ? 'is-selected' : ''
                    }`}
                    style={isDimmed ? { opacity: 0.35 } : undefined}
                    disabled={!hasData}
                    onClick={() => {
                      if (!insight) return
                      triggerLightHaptic(hapticFeedback)
                      onSelectMidiNote(insight.midiNote)
                    }}
                    title={label}
                    aria-label={label}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="pitch-insights-chromatic__pc-labels">
        {CHROMATIC_NOTE_NAMES.map((name, index) => (
          <button
            key={name}
            type="button"
            className={`pitch-insights-chromatic__pc-label ${
              selectedPitchClass === index ? 'is-active' : ''
            }`}
            onClick={() => {
              triggerLightHaptic(hapticFeedback)
              onSelectPitchClass(selectedPitchClass === index ? null : index)
            }}
          >
            {name}
          </button>
        ))}
      </div>

      {registerNote ? <p className="pitch-insights-chromatic__callout">{registerNote}</p> : null}
    </section>
  )
}

function reduceGraphPoints(points: CentsGraphPoint[]): CentsGraphPoint[] {
  const sorted = [...points].sort((left, right) => left.timestamp - right.timestamp)
  if (sorted.length <= GRAPH_POINT_LIMIT) return sorted

  const reduced: CentsGraphPoint[] = []
  const bucketSize = sorted.length / GRAPH_POINT_LIMIT
  for (let bucket = 0; bucket < GRAPH_POINT_LIMIT; bucket += 1) {
    const start = Math.floor(bucket * bucketSize)
    const end = Math.max(start + 1, Math.floor((bucket + 1) * bucketSize))
    const slice = sorted.slice(start, end)
    if (slice.length === 0) continue
    reduced.push({
      id: `bucket-${bucket}-${slice[0]!.id}`,
      timestamp: Math.round(
        slice.reduce((sum, point) => sum + point.timestamp, 0) / slice.length,
      ),
      cents: median(slice.map((point) => point.cents)),
    })
  }
  return reduced
}

function CentsHistoryGraph({
  points,
  ariaLabel,
  emptyMessage = 'More observations will reveal a pattern.',
  xAxis = 'time',
}: {
  points: CentsGraphPoint[]
  ariaLabel: string
  emptyMessage?: string
  /**
   * 'time' spaces points by real elapsed time — right for dense same-session
   * readings. 'sequence' spaces points evenly by index — right for one-point-
   * per-day summaries, where a multi-day practice gap would otherwise stretch
   * a straight line across empty time and imply a gradual change that never
   * happened.
   */
  xAxis?: 'time' | 'sequence'
}) {
  const reduced = reduceGraphPoints(points)
  if (reduced.length === 0) {
    return <div className="pitch-insights-trend__empty">{emptyMessage}</div>
  }

  const width = 360
  const height = 124
  const insetX = 14
  const insetY = 12
  const usableWidth = width - insetX * 2
  const usableHeight = height - insetY * 2
  const firstTimestamp = reduced[0]!.timestamp
  const lastTimestamp = reduced[reduced.length - 1]!.timestamp
  const timeSpan = Math.max(1, lastTimestamp - firstTimestamp)

  const positionFor = (point: CentsGraphPoint, index: number) => {
    const x =
      reduced.length === 1
        ? width / 2
        : xAxis === 'sequence'
          ? insetX + (index / (reduced.length - 1)) * usableWidth
          : insetX + ((point.timestamp - firstTimestamp) / timeSpan) * usableWidth
    const clamped = Math.max(-30, Math.min(30, point.cents))
    const y = insetY + ((30 - clamped) / 60) * usableHeight
    return { x, y, index, cents: point.cents }
  }
  const positions = reduced.map(positionFor)
  const path = positions
    .map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ')

  const inTuneTop = insetY + ((30 - 3) / 60) * usableHeight
  const inTuneBottom = insetY + ((30 + 3) / 60) * usableHeight
  const showEveryPoint = positions.length <= 40

  return (
    <div className="pitch-insights-graph-wrap">
      <span className="pitch-insights-graph-label pitch-insights-graph-label--sharp">+30¢ Sharp</span>
      <svg
        className="pitch-insights-trend"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="none"
      >
        <title>{ariaLabel}</title>
        <defs>
          <linearGradient id="targetZoneGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--pi-good)' }} stopOpacity="0.18" />
            <stop offset="50%" style={{ stopColor: 'var(--pi-good)' }} stopOpacity="0.28" />
            <stop offset="100%" style={{ stopColor: 'var(--pi-good)' }} stopOpacity="0.18" />
          </linearGradient>
        </defs>

        {/* Target Zone Band ±3¢ */}
        <rect
          className="pitch-insights-trend__center-zone"
          x={insetX}
          y={inTuneTop}
          width={usableWidth}
          height={inTuneBottom - inTuneTop}
          rx="4"
          fill="url(#targetZoneGrad)"
        />

        {/* Center 0¢ Zero Line */}
        <line
          x1={insetX}
          y1={height / 2}
          x2={width - insetX}
          y2={height / 2}
          style={{ stroke: 'var(--pi-grid-line)' }}
          strokeDasharray="4 4"
        />

        {/* Trend Path — a single neutral color. Cents direction is already
            carried by the dots below; a left-to-right color ramp here would
            always paint the most recent end "green" regardless of whether
            the trend actually improved. */}
        {reduced.length > 1 ? (
          <path d={path} style={{ stroke: 'var(--pi-accent)' }} strokeWidth="2.5" fill="none" />
        ) : null}

        {/* Graph Node Dots */}
        {positions.map(({ x, y, cents }, index) => {
          if (!showEveryPoint && index !== 0 && index !== positions.length - 1) return null
          const dotColorVar =
            Math.abs(cents) <= 3
              ? 'var(--pi-good)'
              : cents < -3
                ? 'var(--pi-flat)'
                : 'var(--pi-sharp)'

          return (
            <circle
              key={reduced[index]!.id}
              cx={x}
              cy={y}
              r="3.5"
              style={{ fill: 'var(--pi-surface)', stroke: dotColorVar }}
              strokeWidth="2"
            />
          )
        })}
      </svg>
      <span className="pitch-insights-graph-label pitch-insights-graph-label--target">Target Zone ±3¢</span>
      <span className="pitch-insights-graph-label pitch-insights-graph-label--flat">-30¢ Flat</span>
    </div>
  )
}

function TrendSparkline({ observations }: { observations: PitchObservation[] }) {
  const recent = [...observations]
    .sort((left, right) => left.observedAt - right.observedAt)
    .slice(-24)
    .map((observation) => ({
      id: observation.id,
      timestamp: observation.observedAt,
      cents: observation.centsOffset,
    }))
  return (
    <CentsHistoryGraph
      points={recent}
      ariaLabel="Recent pitch tendency in cents"
      emptyMessage="More observations will reveal a trend."
    />
  )
}

function PitchNoteList({
  insights,
  formatNoteName,
  labelSummary,
  onSelect,
}: {
  insights: NotePitchInsight[]
  formatNoteName: (midiNote: number, fallback: string) => string
  labelSummary: string
  onSelect: (midiNote: number) => void
}) {
  return (
    <section className="pitch-insights-list" aria-label="Pitch tendencies">
      <header>
        <div>
          <span>Pitch Register Breakdown</span>
          <strong>{plural(insights.length, 'pitch', 'pitches')}</strong>
        </div>
        <small>{labelSummary}</small>
      </header>
      <div className="pitch-insights-list__rows">
        {insights.map((insight) => {
          const displayName = formatNoteName(insight.midiNote, insight.noteName)
          const cents = insight.typicalCents
          const statusClass =
            insight.confidence === 'collecting'
              ? 'is-collecting'
              : Math.abs(cents) <= 3
                ? 'is-centered'
                : cents < -3
                  ? 'is-flat'
                  : 'is-sharp'

          return (
            <button
              key={insight.midiNote}
              type="button"
              className={`pitch-insights-row ${statusClass}`}
              onClick={() => onSelect(insight.midiNote)}
            >
              <strong className="pitch-insights-row__note">{displayName}</strong>
              <div className="pitch-insights-row__copy">
                <strong>{tendencyLabel(insight)}</strong>
                <span>
                  {plural(insight.observationCount, 'observation')}
                  {' · '}{marginLabel(insight)}
                </span>
              </div>
              <span className="pitch-insights-row__cents">
                {insight.confidence === 'collecting' ? '—' : formatCents(insight.typicalCents)}
              </span>
              <ChevronRight aria-hidden />
            </button>
          )
        })}
      </div>
    </section>
  )
}

function InsightDetail({
  insight,
  displayName,
  scopeLabel,
  onBack,
}: {
  insight: NotePitchInsight
  displayName: string
  scopeLabel: string
  onBack: () => void
}) {
  const improvement = insight.improvementCents
  const improving = improvement != null && improvement > 0
  const hasTendency = insight.confidence !== 'collecting'

  return (
    <motion.div
      className="pitch-insights-detail"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={iosSpringSnappy}
    >
      <button type="button" className="pitch-insights-back" onClick={onBack}>
        <ChevronLeft aria-hidden />
        {scopeLabel}
      </button>

      <header className="pitch-insights-detail__hero">
        <div>
          <span>{confidenceLabel(insight)}</span>
          <h2>{displayName}</h2>
          <p>{describePitchInsight({ ...insight, noteName: displayName })}</p>
        </div>
        <strong>{insight.confidence === 'collecting' ? 'Learning' : formatCents(insight.typicalCents)}</strong>
      </header>

      <div className="pitch-insights-detail__metrics">
        <article>
          <span>Typical tendency</span>
          <strong>{hasTendency ? formatCents(insight.typicalCents) : '—'}</strong>
          <small>{tendencyLabel(insight)}</small>
        </article>
        <article>
          <span>Observations</span>
          <strong>{insight.observationCount}</strong>
          <small>{marginLabel(insight)}</small>
        </article>
        <article>
          <span>Consistency</span>
          <strong>{hasTendency ? insight.consistency : '—'}</strong>
          <small>
            {hasTendency
              ? `Spread ±${Math.round(insight.typicalVariability)}¢`
              : 'More stable notes needed'}
          </small>
        </article>
      </div>

      <section className="pitch-insights-detail__trend-card">
        <header>
          <div>
            <span>Intonation Trend</span>
            <strong>Last {Math.min(24, insight.observationCount)} observations</strong>
          </div>
          {improvement != null ? (
            <div className={`pitch-insights-trend-label ${improving ? 'is-improving' : ''}`}>
              {improving ? <TrendingDown aria-hidden /> : <TrendingUp aria-hidden />}
              {improving ? `${Math.round(improvement)}¢ closer to center` : 'Recent shift'}
            </div>
          ) : (
            <div className="pitch-insights-trend-label">
              <Minus aria-hidden /> Building history
            </div>
          )}
        </header>
        <p className="pitch-insights-detail__trend-basis">
          {improvement != null
            ? `Comparing the last ${PITCH_INSIGHTS_THRESHOLDS.recentWindowDays} days to what came before, ${PITCH_INSIGHTS_THRESHOLDS.minimumTrendGroupObservations}+ observations each side.`
            : `Needs ${PITCH_INSIGHTS_THRESHOLDS.minimumTrendGroupObservations}+ observations in the last ${PITCH_INSIGHTS_THRESHOLDS.recentWindowDays} days and ${PITCH_INSIGHTS_THRESHOLDS.minimumTrendGroupObservations}+ from before that to compare.`}
        </p>
        {hasTendency ? (
          <TrendSparkline observations={insight.observations} />
        ) : (
          <div className="pitch-insights-trend__empty">
            More observations will reveal a trend.
          </div>
        )}
        <div className="pitch-insights-detail__comparison">
          <span>
            {scopeLabel} <strong>{hasTendency ? formatCents(insight.typicalCents) : '—'}</strong>
          </span>
        </div>
      </section>
    </motion.div>
  )
}

function PracticeDayDetail({
  day,
  insights,
  formatNoteName,
  displayLabel,
  resetting,
  hapticFeedback,
  onBack,
  onSelectNote,
  onReset,
}: {
  day: PitchPracticeDaySummary
  insights: NotePitchInsight[]
  formatNoteName: (midiNote: number, fallback: string) => string
  displayLabel: string
  resetting: boolean
  hapticFeedback: boolean
  onBack: () => void
  onSelectNote: (midiNote: number) => void
  onReset: () => void
}) {
  const points = day.observations.map((observation) => ({
    id: observation.id,
    timestamp: observation.observedAt,
    cents: observation.centsOffset,
  }))

  return (
    <motion.div
      className="pitch-insights-detail pitch-insights-day-detail"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={iosSpringSnappy}
    >
      <button type="button" className="pitch-insights-back" onClick={onBack}>
        <ChevronLeft aria-hidden />
        Practice days
      </button>

      <header className="pitch-insights-detail__hero pitch-insights-day-detail__hero">
        <div>
          <span>Practice day</span>
          <h2>{formatDayHeading(day)}</h2>
          <p>{fullDateFormatter.format(day.startAt)}</p>
        </div>
        <strong>{formatCents(day.typicalCents)}</strong>
      </header>

      <div className="pitch-insights-detail__metrics">
        <article>
          <span>Sessions</span>
          <strong>{day.sessionCount}</strong>
          <small>Separate tuner visits</small>
        </article>
        <article>
          <span>Stable notes</span>
          <strong>{day.observationCount}</strong>
          <small>{plural(day.pitchCount, 'pitch', 'pitches')} heard</small>
        </article>
        <article>
          <span>Daily tendency</span>
          <strong>{formatCents(day.typicalCents)}</strong>
          <small>Median for the day</small>
        </article>
      </div>

      <section className="pitch-insights-detail__trend-card pitch-insights-history-card">
        <header>
          <div>
            <span>Daily graph</span>
            <strong>Every stable note from this day</strong>
          </div>
        </header>
        <CentsHistoryGraph points={points} ariaLabel={`Pitch tendency for ${fullDateFormatter.format(day.startAt)}`} />
      </section>

      <section className="pitch-insights-sessions" aria-label="Practice sessions">
        <header>
          <span>Sessions</span>
          <strong>{plural(day.sessionCount, 'session')}</strong>
        </header>
        <div className="pitch-insights-sessions__rows">
          {day.sessions.map((session) => {
            const warmUpNote = describeWarmUpDrift(session)
            return (
              <div className="pitch-insights-session-row" key={session.id}>
                <div>
                  <strong>{sessionTimeRange(session.startedAt, session.endedAt)}</strong>
                  <span>
                    {plural(session.observationCount, 'stable note')}
                    {' · '}{plural(session.pitchCount, 'pitch', 'pitches')}
                  </span>
                  {warmUpNote ? (
                    <span className="pitch-insights-session-row__note">{warmUpNote}</span>
                  ) : null}
                </div>
                <strong>{formatCents(session.typicalCents)}</strong>
              </div>
            )
          })}
        </div>
      </section>

      <PitchNoteList
        insights={insights}
        formatNoteName={formatNoteName}
        labelSummary={`${displayLabel} labels · this day`}
        onSelect={onSelectNote}
      />

      <section className="pitch-insights-reset-zone">
        <div>
          <strong>Reset this day</strong>
          <span>Remove this day from Pitch Insights without changing other days.</span>
        </div>
        <Pressable
          type="button"
          intensity="normal"
          haptic="light"
          hapticFeedback={hapticFeedback}
          className="pitch-insights-reset-button"
          disabled={resetting}
          onClick={onReset}
        >
          <RotateCcw aria-hidden />
          {resetting ? 'Resetting…' : 'Reset day'}
        </Pressable>
      </section>
    </motion.div>
  )
}

export default function PitchInsightsScreen({
  isOpen,
  onClose,
  transpositionId = 'concert',
  tunerInstrument,
  formatNoteName = (_midiNote, fallback) => fallback,
  hapticFeedback = true,
}: PitchInsightsScreenProps) {
  const { showAlert, showConfirm } = useActionSheet()
  const [observations, setObservations] = useState<PitchObservation[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null)
  const [selectedMidi, setSelectedMidi] = useState<number | null>(null)
  const [selectedPitchClass, setSelectedPitchClass] = useState<number | null>(null)
  const [showAllDays, setShowAllDays] = useState(false)
  const [resettingKey, setResettingKey] = useState<string | null>(null)
  const [selectedInstrument, setSelectedInstrument] = useState<TunerInstrument | 'all'>(
    tunerInstrument ?? 'all',
  )

  const activeRef = useRef(false)
  const loadSequenceRef = useRef(0)
  const fallbackReloadTimerRef = useRef<number | null>(null)
  const liveUpdateTimerRef = useRef<number | null>(null)
  const pendingSavedRef = useRef<PitchObservation[]>([])

  const load = useCallback(async () => {
    const sequence = ++loadSequenceRef.current
    try {
      const rows = await listPitchObservations()
      if (!activeRef.current || sequence !== loadSequenceRef.current) return
      setObservations(rows)
      setLoadError(false)
    } catch (error) {
      if (!activeRef.current || sequence !== loadSequenceRef.current) return
      console.warn('[PitchInsights] Failed to load observations', error)
      setLoadError(true)
    } finally {
      if (activeRef.current && sequence === loadSequenceRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      activeRef.current = false
      loadSequenceRef.current += 1
      if (fallbackReloadTimerRef.current != null) {
        window.clearTimeout(fallbackReloadTimerRef.current)
        fallbackReloadTimerRef.current = null
      }
      if (liveUpdateTimerRef.current != null) {
        window.clearTimeout(liveUpdateTimerRef.current)
        liveUpdateTimerRef.current = null
      }
      pendingSavedRef.current = []
      return
    }

    activeRef.current = true
    setLoading(true)
    void load()

    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent<PitchInsightsUpdatedDetail>).detail
      if (detail?.kind === 'saved') {
        pendingSavedRef.current.push(detail.observation)
        if (liveUpdateTimerRef.current == null) {
          liveUpdateTimerRef.current = window.setTimeout(() => {
            liveUpdateTimerRef.current = null
            const pending = pendingSavedRef.current
              .splice(0)
              .sort((left, right) => right.observedAt - left.observedAt)
            if (pending.length === 0 || !activeRef.current) return
            setObservations((current) => {
              const currentIds = new Set(current.map((observation) => observation.id))
              const additions = pending.filter((observation) => !currentIds.has(observation.id))
              return additions.length > 0 ? [...additions, ...current] : current
            })
          }, 750)
        }
        return
      }
      if (detail?.kind === 'cleared') {
        pendingSavedRef.current = []
        if (liveUpdateTimerRef.current != null) {
          window.clearTimeout(liveUpdateTimerRef.current)
          liveUpdateTimerRef.current = null
        }
        setObservations([])
        return
      }
      if (detail?.kind === 'range-deleted') {
        pendingSavedRef.current = pendingSavedRef.current.filter(
          (observation) =>
            observation.observedAt < detail.startAt ||
            observation.observedAt >= detail.endAt,
        )
        setObservations((current) =>
          current.filter(
            (observation) =>
              observation.observedAt < detail.startAt ||
              observation.observedAt >= detail.endAt,
          ),
        )
        return
      }

      if (fallbackReloadTimerRef.current != null) {
        window.clearTimeout(fallbackReloadTimerRef.current)
      }
      fallbackReloadTimerRef.current = window.setTimeout(() => {
        fallbackReloadTimerRef.current = null
        if (activeRef.current) void load()
      }, 500)
    }
    window.addEventListener(PITCH_INSIGHTS_UPDATED_EVENT, handleUpdate)
    return () => {
      activeRef.current = false
      loadSequenceRef.current += 1
      window.removeEventListener(PITCH_INSIGHTS_UPDATED_EVENT, handleUpdate)
      if (fallbackReloadTimerRef.current != null) {
        window.clearTimeout(fallbackReloadTimerRef.current)
        fallbackReloadTimerRef.current = null
      }
      if (liveUpdateTimerRef.current != null) {
        window.clearTimeout(liveUpdateTimerRef.current)
        liveUpdateTimerRef.current = null
      }
      pendingSavedRef.current = []
    }
  }, [isOpen, load])

  useEffect(() => {
    if (!isOpen) {
      setSelectedMidi(null)
      setSelectedDayKey(null)
      setSelectedPitchClass(null)
      setShowAllDays(false)
      setResettingKey(null)
      setSelectedInstrument(tunerInstrument ?? 'all')
    }
  }, [isOpen, tunerInstrument])

  // Observations are tagged with the instrument that was active when they
  // were captured. Pooling e.g. Voice and Winds tendencies for "the same"
  // note would blend two unrelated intonation habits into one misleading
  // number, so only show the filter (and apply it) once more than one
  // instrument actually shows up in the history — most players only ever
  // see one and the screen stays exactly as before.
  const instrumentsPresent = useMemo(
    () =>
      TUNER_INSTRUMENTS.filter((instrument) =>
        observations.some((observation) => observation.tunerInstrument === instrument),
      ),
    [observations],
  )
  const showInstrumentFilter = instrumentsPresent.length > 1
  const visibleObservations = useMemo(() => {
    if (!showInstrumentFilter || selectedInstrument === 'all') return observations
    return observations.filter((observation) => observation.tunerInstrument === selectedInstrument)
  }, [observations, showInstrumentFilter, selectedInstrument])
  const allObservationsDayCount = useMemo(
    () =>
      new Set(observations.map((observation) => localPracticeDayBounds(observation.observedAt).key))
        .size,
    [observations],
  )

  const days = useMemo(() => summarizePitchPracticeDays(visibleObservations), [visibleObservations])
  const selectedDay = days.find((day) => day.key === selectedDayKey) ?? null
  const scopedObservations = selectedDay?.observations ?? visibleObservations
  const allInsights = useMemo(
    () => aggregatePitchInsights(scopedObservations),
    [scopedObservations],
  )

  const filteredInsights = useMemo(() => {
    if (selectedPitchClass === null) return allInsights
    return allInsights.filter((insight) => insight.midiNote % 12 === selectedPitchClass)
  }, [allInsights, selectedPitchClass])

  const selected = allInsights.find((insight) => insight.midiNote === selectedMidi) ?? null
  const displayProfile = getTunerTransposition(transpositionId)
  const sessionCount = useMemo(
    () => days.reduce((sum, day) => sum + day.sessionCount, 0),
    [days],
  )
  const overallMedian = useMemo(
    () => median(visibleObservations.map((observation) => observation.centsOffset)),
    [visibleObservations],
  )
  const allTimePoints = useMemo(
    () =>
      [...days].reverse().map((day) => ({
        id: day.key,
        timestamp: day.startAt,
        cents: day.typicalCents,
      })),
    [days],
  )
  const visibleDays = showAllDays ? days : days.slice(0, DAY_PREVIEW_COUNT)

  const selectNote = useCallback(
    (midiNote: number) => {
      triggerLightHaptic(hapticFeedback)
      setSelectedMidi(midiNote)
    },
    [hapticFeedback],
  )

  const resetDay = useCallback(
    async (day: PitchPracticeDaySummary) => {
      const confirmed = await showConfirm({
        title: `Reset ${formatDayHeading(day)}?`,
        message: `${plural(day.observationCount, 'stable note')} from ${plural(day.sessionCount, 'session')} will be removed from Pitch Insights. Other days will stay intact.`,
        confirmLabel: 'Reset Day',
        destructive: true,
      })
      if (!confirmed) return

      setResettingKey(day.key)
      try {
        await deletePitchObservationsInRange(day.startAt, day.endAt)
        setSelectedMidi(null)
        if (selectedDayKey === day.key) setSelectedDayKey(null)
      } catch (error) {
        console.warn('[PitchInsights] Failed to reset practice day', error)
        await showAlert({
          title: 'Couldn’t reset this day',
          message: 'Your Pitch Insights history was not changed. Please try again.',
          tone: 'error',
        })
      } finally {
        setResettingKey(null)
      }
    },
    [selectedDayKey, showAlert, showConfirm],
  )

  const resetAll = useCallback(async () => {
    // Always clears every instrument's history, regardless of the filter
    // above — the count here is the true (unfiltered) total so the dialog
    // never understates what "Reset all" is about to delete.
    const confirmed = await showConfirm({
      title: 'Reset all Pitch Insights?',
      message: `${plural(observations.length, 'stable note')} across ${plural(allObservationsDayCount, 'practice day')}${
        showInstrumentFilter ? ', across every instrument,' : ''
      } will be permanently removed from this device.`,
      confirmLabel: 'Reset All',
      destructive: true,
    })
    if (!confirmed) return

    setResettingKey('all')
    try {
      await clearPitchObservations()
      setSelectedMidi(null)
      setSelectedDayKey(null)
    } catch (error) {
      console.warn('[PitchInsights] Failed to reset all history', error)
      await showAlert({
        title: 'Couldn’t reset Pitch Insights',
        message: 'Your Pitch Insights history was not changed. Please try again.',
        tone: 'error',
      })
    } finally {
      setResettingKey(null)
    }
  }, [allObservationsDayCount, observations.length, showAlert, showConfirm, showInstrumentFilter])

  return (
    <AnimatedBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Pitch Insights"
      maxHeightClass="max-h-[min(92vh,100dvh)]"
      motionPreset="premium"
      elevated
      elevatedLight
      vaultTheme
    >
      <div className="pitch-insights-screen">
        <header className="pitch-insights-screen__topbar">
          <div className="pitch-insights-screen__title-wrap">
            <div className="pitch-insights-screen__badge">
              <Sparkles className="pitch-insights-screen__sparkle" aria-hidden />
              <span>PRO ANALYTICS</span>
            </div>
            <h2>Pitch Insights</h2>
          </div>
          <Pressable
            type="button"
            intensity="icon"
            haptic="light"
            hapticFeedback={hapticFeedback}
            onClick={onClose}
            aria-label="Close Pitch Insights"
            className="pitch-insights-screen__close"
          >
            <X aria-hidden />
          </Pressable>
        </header>

        <div className="pitch-insights-screen__scroll">
          <AnimatePresence mode="wait">
            {selected ? (
              <InsightDetail
                key={`detail-${selectedDayKey ?? 'all'}-${selected.midiNote}`}
                insight={selected}
                displayName={formatNoteName(selected.midiNote, selected.noteName)}
                scopeLabel={selectedDay ? formatDayHeading(selectedDay) : 'All notes'}
                onBack={() => setSelectedMidi(null)}
              />
            ) : selectedDay ? (
              <PracticeDayDetail
                key={`day-${selectedDay.key}`}
                day={selectedDay}
                insights={filteredInsights}
                formatNoteName={formatNoteName}
                displayLabel={displayProfile.shortLabel}
                resetting={resettingKey === selectedDay.key}
                hapticFeedback={hapticFeedback}
                onBack={() => setSelectedDayKey(null)}
                onSelectNote={selectNote}
                onReset={() => void resetDay(selectedDay)}
              />
            ) : (
              <motion.div
                key="overview"
                className="pitch-insights-overview"
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={iosSpringSnappy}
              >
                <AccuracyHeader observations={scopedObservations} />

                <section className="pitch-insights-intro">
                  <span>Intonation Profile · {displayProfile.shortLabel} labels</span>
                  <h1>Intonation History</h1>
                  <p>
                    Automatic stable-note analytics captured from your live tuner practice.
                  </p>
                  {visibleObservations.length > 0 ? (
                    <div className="pitch-insights-intro__stats">
                      <span>
                        <strong>{days.length}</strong> practice days
                      </span>
                      <span>
                        <strong>{sessionCount}</strong> sessions
                      </span>
                      <span>
                        <strong>{visibleObservations.length}</strong> stable notes
                      </span>
                    </div>
                  ) : null}
                </section>

                {showInstrumentFilter ? (
                  <div
                    className="pitch-insights-instrument-filter"
                    role="tablist"
                    aria-label="Filter Pitch Insights by instrument"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={selectedInstrument === 'all'}
                      className={`pitch-insights-instrument-filter__pill ${
                        selectedInstrument === 'all' ? 'is-active' : ''
                      }`}
                      onClick={() => {
                        triggerLightHaptic(hapticFeedback)
                        setSelectedInstrument('all')
                      }}
                    >
                      All instruments
                    </button>
                    {instrumentsPresent.map((instrument) => (
                      <button
                        key={instrument}
                        type="button"
                        role="tab"
                        aria-selected={selectedInstrument === instrument}
                        className={`pitch-insights-instrument-filter__pill ${
                          selectedInstrument === instrument ? 'is-active' : ''
                        }`}
                        onClick={() => {
                          triggerLightHaptic(hapticFeedback)
                          setSelectedInstrument(instrument)
                        }}
                      >
                        {getTunerProfile(instrument).label}
                      </button>
                    ))}
                  </div>
                ) : null}

                <ChromaticPitchMatrix
                  insights={allInsights}
                  selectedPitchClass={selectedPitchClass}
                  onSelectPitchClass={setSelectedPitchClass}
                  onSelectMidiNote={selectNote}
                  hapticFeedback={hapticFeedback}
                />

                {loading ? (
                  <div className="pitch-insights-state" role="status">
                    <span className="pitch-insights-state__spinner" />
                    Analyzing pitch history…
                  </div>
                ) : loadError ? (
                  <div className="pitch-insights-state">
                    <Clock3 aria-hidden />
                    <strong>Pitch history is temporarily unavailable.</strong>
                    <button type="button" onClick={() => void load()}>
                      Try again
                    </button>
                  </div>
                ) : days.length === 0 ? (
                  <div className="pitch-insights-state pitch-insights-state--empty">
                    <BarChart3 aria-hidden />
                    <strong>Practice with the live tuner to build your profile.</strong>
                    <p>
                      Pitch Insights will record your stable note holds and calculate your pitch
                      tendencies per note.
                    </p>
                  </div>
                ) : (
                  <>
                    <section className="pitch-insights-days" aria-label="Practice days">
                      <header>
                        <div>
                          <span>Practice Days</span>
                          <strong>{plural(days.length, 'day')}</strong>
                        </div>
                        <small>Open a day to inspect sessions</small>
                      </header>
                      <div className="pitch-insights-days__rows">
                        {visibleDays.map((day) => (
                          <article className="pitch-insights-day-row" key={day.key}>
                            <button
                              type="button"
                              className="pitch-insights-day-row__open"
                              onClick={() => {
                                triggerLightHaptic(hapticFeedback)
                                setSelectedDayKey(day.key)
                              }}
                            >
                              <span className="pitch-insights-day-row__date" aria-hidden>
                                <small>{monthFormatter.format(day.startAt)}</small>
                                <strong>{dayNumberFormatter.format(day.startAt)}</strong>
                              </span>
                              <span className="pitch-insights-day-row__copy">
                                <strong>{formatDayHeading(day)}</strong>
                                <small>
                                  {plural(day.sessionCount, 'session')}
                                  {' · '}{plural(day.observationCount, 'stable note')}
                                </small>
                              </span>
                              <span className="pitch-insights-day-row__cents">
                                {formatCents(day.typicalCents)}
                              </span>
                              <ChevronRight aria-hidden />
                            </button>
                            <Pressable
                              type="button"
                              intensity="icon"
                              haptic="light"
                              hapticFeedback={hapticFeedback}
                              className="pitch-insights-day-row__reset"
                              aria-label={`Reset Pitch Insights for ${fullDateFormatter.format(day.startAt)}`}
                              disabled={resettingKey === day.key}
                              onClick={() => void resetDay(day)}
                            >
                              <RotateCcw aria-hidden />
                            </Pressable>
                          </article>
                        ))}
                      </div>
                      {days.length > DAY_PREVIEW_COUNT ? (
                        <button
                          type="button"
                          className="pitch-insights-days__more"
                          onClick={() => setShowAllDays((current) => !current)}
                        >
                          {showAllDays ? 'Show recent days' : `Show all ${days.length} days`}
                        </button>
                      ) : null}
                    </section>

                    <section className="pitch-insights-all-time pitch-insights-history-card">
                      <header>
                        <div>
                          <span>All-Time Cent Trend</span>
                          <strong>Daily median intonation</strong>
                        </div>
                        <button
                          type="button"
                          className="pitch-insights-all-time__reset"
                          disabled={resettingKey === 'all'}
                          onClick={() => void resetAll()}
                        >
                          <RotateCcw aria-hidden />
                          {resettingKey === 'all' ? 'Resetting…' : 'Reset all'}
                        </button>
                      </header>
                      <CentsHistoryGraph
                        points={allTimePoints}
                        ariaLabel={`All-time daily pitch tendency across ${plural(days.length, 'practice day')}`}
                        xAxis="sequence"
                      />
                      <footer>
                        <span>{shortDateFormatter.format(days[days.length - 1]!.startAt)}</span>
                        <strong>{formatCents(overallMedian)} overall median</strong>
                        <span>{shortDateFormatter.format(days[0]!.startAt)}</span>
                      </footer>
                    </section>

                    <PitchNoteList
                      insights={filteredInsights}
                      formatNoteName={formatNoteName}
                      labelSummary={`${displayProfile.shortLabel} labels · ${
                        selectedPitchClass !== null
                          ? `${CHROMATIC_NOTE_NAMES[selectedPitchClass]} notes`
                          : 'all time'
                      }`}
                      onSelect={selectNote}
                    />
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </AnimatedBottomSheet>
  )
}
