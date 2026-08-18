import { AnimatePresence, motion } from 'framer-motion'
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Minus,
  Plus,
  RotateCcw,
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
  rankNotesWorthReviewing,
  summarizeOverallPitchTrend,
  summarizePitchPracticeDays,
  tendencyForCents,
  type NotePitchInsight,
  type PitchPracticeDaySummary,
  type PitchPracticeSessionSummary,
  type PitchTendency,
} from '../../utils/pitchInsightsAnalytics'
import { triggerLightHaptic } from '../../utils/haptics'
import { iosSpringSnappy } from '../../utils/motionPresets'
import type { TunerInstrument } from '../../utils/pitchConfig'
import {
  getTunerTransposition,
  TUNER_TRANSPOSITION_OPTIONS,
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

const ADDED_INSTRUMENTS_KEY = 'besttake:pitch-insights-instruments'
const DAY_PREVIEW_COUNT = 6
const GRAPH_POINT_LIMIT = 160
/** Half-range of the rail widget in cents — the visual scale a dot moves across. */
const PITCH_RAIL_RANGE_CENTS = 30

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

/** Same ±3¢ boundary already used throughout this screen for note-tile and
 * graph-dot coloring — kept in one place so the rail agrees with them. */
function zoneForCents(cents: number): 'good' | 'flat' | 'sharp' {
  if (Math.abs(cents) <= PITCH_INSIGHTS_THRESHOLDS.centeredCents) return 'good'
  return cents < 0 ? 'flat' : 'sharp'
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
    return `${plural(insight.observationCount, 'note held', 'notes held')} — too early to tell`
  }
  return `${plural(insight.observationCount, 'note held', 'notes held')} · ±${Math.round(margin)}¢ margin`
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

/** Plain-language row verdict for the compact note rows — same underlying
 * consistency/tendency fields as tendencyLabel, said the way you'd say it
 * to a student rather than as a statistics label. */
function rowVerdict(insight: NotePitchInsight): string {
  if (insight.confidence === 'collecting') return 'Still learning this note'
  const varies = insight.consistency === 'Variable'
  switch (insight.tendency) {
    case 'Centered':
      return varies ? 'Wanders around center' : 'Centered and steady'
    case 'Slightly Flat':
      return varies ? 'Mostly flat, and varies' : 'Steady, slightly flat'
    case 'Tends Flat':
      return varies ? 'Runs flat, and varies' : 'Steady, but flat'
    case 'Slightly Sharp':
      return varies ? 'Mostly sharp, and varies' : 'Steady, slightly sharp'
    case 'Tends Sharp':
      return varies ? 'Runs sharp, and varies' : 'Steady, but sharp'
  }
}

/**
 * The position-on-a-strip widget from the live tuner (CentsNeedle /
 * pitch-needle-rail), reused here instead of a chart: one visual idea for
 * the hero, every note row, and — via PitchNoteList — the note detail and
 * day detail screens too. Purely decorative; the surrounding text already
 * carries the reading, so it's hidden from assistive tech.
 */
function PitchRail({ cents, size = 'hero' }: { cents: number; size?: 'hero' | 'mini' }) {
  const clamped = Math.max(-PITCH_RAIL_RANGE_CENTS, Math.min(PITCH_RAIL_RANGE_CENTS, cents))
  const position = 50 + (clamped / PITCH_RAIL_RANGE_CENTS) * 50
  const zone = zoneForCents(cents)
  const goodHalf = (PITCH_INSIGHTS_THRESHOLDS.centeredCents / PITCH_RAIL_RANGE_CENTS) * 50
  const closeHalf = (PITCH_INSIGHTS_THRESHOLDS.slightTendencyCents / PITCH_RAIL_RANGE_CENTS) * 50

  return (
    <div className={`pitch-insights-rail pitch-insights-rail--${size}`} aria-hidden="true">
      <div className="pitch-insights-rail__track" />
      <div
        className="pitch-insights-rail__zone pitch-insights-rail__zone--close"
        style={{ left: `${50 - closeHalf}%`, width: `${closeHalf * 2}%` }}
      />
      <div
        className="pitch-insights-rail__zone pitch-insights-rail__zone--good"
        style={{ left: `${50 - goodHalf}%`, width: `${goodHalf * 2}%` }}
      />
      {size === 'hero' ? <div className="pitch-insights-rail__zero" /> : null}
      <div
        className={`pitch-insights-rail__dot pitch-insights-rail__dot--${zone}`}
        style={{ left: `${position}%` }}
      />
    </div>
  )
}

function heroStatusWord(tendency: PitchTendency): string {
  switch (tendency) {
    case 'Centered':
      return 'Centered'
    case 'Slightly Flat':
      return 'Slightly flat'
    case 'Slightly Sharp':
      return 'Slightly sharp'
    case 'Tends Flat':
      return 'Runs flat'
    case 'Tends Sharp':
      return 'Runs sharp'
  }
}

function PitchInsightsHero({
  observations,
  registerNote,
}: {
  observations: PitchObservation[]
  registerNote: string | null
}) {
  const trend = useMemo(() => summarizeOverallPitchTrend(observations), [observations])
  if (observations.length === 0) return null

  const tendency = tendencyForCents(trend.overallCents)
  const zone = zoneForCents(trend.overallCents)
  const improving = trend.deltaCents != null && trend.deltaCents > 0

  return (
    <section
      className={`pitch-insights-hero pitch-insights-hero--${zone}`}
      aria-label={`Overall intonation: ${heroStatusWord(tendency)}, ${formatCents(trend.overallCents)} median`}
    >
      <span className="pitch-insights-hero__eyebrow">Across every note you play</span>
      <strong className="pitch-insights-hero__status">{heroStatusWord(tendency)}</strong>
      <PitchRail cents={trend.overallCents} size="hero" />
      <div className="pitch-insights-hero__ticks" aria-hidden="true">
        <span>flat</span>
        <span>centered</span>
        <span>sharp</span>
      </div>
      <p className="pitch-insights-hero__sub">
        {trend.deltaCents != null ? (
          <>
            <strong className={improving ? 'is-improving' : ''}>
              {improving ? 'Getting closer' : 'Recent shift'}
            </strong>
            {' — '}
            {Math.round(Math.abs(trend.deltaCents))}
            ¢ {improving ? 'nearer center' : 'from center'} than{' '}
            {PITCH_INSIGHTS_THRESHOLDS.recentWindowDays} days ago
          </>
        ) : (
          `${formatCents(trend.overallCents)} median across ${plural(observations.length, 'note held', 'notes held')}`
        )}
      </p>
      {registerNote ? <p className="pitch-insights-hero__register">{registerNote}</p> : null}
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
  emptyMessage = 'Keep playing to see a pattern.',
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
      <span className="pitch-insights-graph-label pitch-insights-graph-label--sharp">+30¢</span>
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
      <span className="pitch-insights-graph-label pitch-insights-graph-label--target">±3¢</span>
      <span className="pitch-insights-graph-label pitch-insights-graph-label--flat">−30¢</span>
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
      emptyMessage="Keep playing to see a trend."
    />
  )
}

/** One row, reused by "Worth a look", "All notes", and the note list inside
 * a day's detail view: note tile, plain-language verdict, and the same rail
 * widget shown big in the hero — no separate chart per list. */
function PitchInsightsNoteRow({
  insight,
  formatNoteName,
  onSelect,
}: {
  insight: NotePitchInsight
  formatNoteName: (midiNote: number, fallback: string) => string
  onSelect: (midiNote: number) => void
}) {
  const displayName = formatNoteName(insight.midiNote, insight.noteName)
  const collecting = insight.confidence === 'collecting'
  const statusClass = collecting
    ? ''
    : zoneForCents(insight.typicalCents) === 'good'
      ? 'is-centered'
      : zoneForCents(insight.typicalCents) === 'flat'
        ? 'is-flat'
        : 'is-sharp'

  return (
    <button
      type="button"
      className={`pitch-insights-row ${statusClass}`}
      onClick={() => onSelect(insight.midiNote)}
    >
      <strong className="pitch-insights-row__note">{displayName}</strong>
      <div className="pitch-insights-row__copy">
        <strong>{rowVerdict(insight)}</strong>
        <span>{plural(insight.observationCount, 'note held', 'notes held')}</span>
      </div>
      {collecting ? (
        <span className="pitch-insights-row__collecting">Collecting</span>
      ) : (
        <PitchRail cents={insight.typicalCents} size="mini" />
      )}
      <ChevronRight aria-hidden />
    </button>
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
    <section className="pitch-insights-list" aria-label="All notes">
      <header>
        <div>
          <span>All Notes</span>
          <strong>{plural(insights.length, 'pitch', 'pitches')}</strong>
        </div>
        <small>{labelSummary}</small>
      </header>
      <div className="pitch-insights-list__rows">
        {insights.map((insight) => (
          <PitchInsightsNoteRow
            key={insight.midiNote}
            insight={insight}
            formatNoteName={formatNoteName}
            onSelect={onSelect}
          />
        ))}
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
          <span>Tendency</span>
          <strong>{hasTendency ? formatCents(insight.typicalCents) : '—'}</strong>
          <small>{tendencyLabel(insight)}</small>
        </article>
        <article>
          <span>Notes held</span>
          <strong>{insight.observationCount}</strong>
          <small>{marginLabel(insight)}</small>
        </article>
        <article>
          <span>Consistency</span>
          <strong>{hasTendency ? insight.consistency : '—'}</strong>
          <small>
            {hasTendency
              ? `Spread ±${Math.round(insight.typicalVariability)}¢`
              : 'Not enough yet'}
          </small>
        </article>
      </div>

      <section className="pitch-insights-detail__trend-card">
        <header>
          <div>
            <span>Recent trend</span>
            <strong>Last {Math.min(24, insight.observationCount)} held</strong>
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
            ? `Last ${PITCH_INSIGHTS_THRESHOLDS.recentWindowDays} days vs. everything before.`
            : 'Keep playing — a trend needs a couple more weeks of history.'}
        </p>
        {hasTendency ? (
          <TrendSparkline observations={insight.observations} />
        ) : (
          <div className="pitch-insights-trend__empty">
            Keep playing to see a trend.
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
            <strong>Every note held on this day</strong>
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
                    {plural(session.observationCount, 'note held', 'notes held')}
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

/** Destination of the "All notes" row in the overview's More list. */
function AllNotesScreen({
  insights,
  formatNoteName,
  labelSummary,
  onBack,
  onSelectNote,
}: {
  insights: NotePitchInsight[]
  formatNoteName: (midiNote: number, fallback: string) => string
  labelSummary: string
  onBack: () => void
  onSelectNote: (midiNote: number) => void
}) {
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
        Overview
      </button>
      <PitchNoteList
        insights={insights}
        formatNoteName={formatNoteName}
        labelSummary={labelSummary}
        onSelect={onSelectNote}
      />
    </motion.div>
  )
}

/** Destination of the "Practice days" row in the overview's More list —
 * the all-time trend graph plus the day-by-day list, moved out of the
 * overview scroll so it no longer duplicates the hero as a second summary. */
function PracticeDaysScreen({
  days,
  visibleDays,
  showAllDays,
  overallMedian,
  allTimePoints,
  resettingKey,
  hapticFeedback,
  onBack,
  onToggleShowAllDays,
  onOpenDay,
  onResetDay,
  onResetAll,
}: {
  days: PitchPracticeDaySummary[]
  visibleDays: PitchPracticeDaySummary[]
  showAllDays: boolean
  overallMedian: number
  allTimePoints: CentsGraphPoint[]
  resettingKey: string | null
  hapticFeedback: boolean
  onBack: () => void
  onToggleShowAllDays: () => void
  onOpenDay: (dayKey: string) => void
  onResetDay: (day: PitchPracticeDaySummary) => void
  onResetAll: () => void
}) {
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
        Overview
      </button>

      <section className="pitch-insights-all-time pitch-insights-history-card">
        <header>
          <div>
            <span>Daily trend</span>
            <strong>Median for each practice day</strong>
          </div>
          <button
            type="button"
            className="pitch-insights-all-time__reset"
            disabled={resettingKey === 'all'}
            onClick={onResetAll}
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
        {days.length > 0 ? (
          <footer>
            <span>{shortDateFormatter.format(days[days.length - 1]!.startAt)}</span>
            <strong>{formatCents(overallMedian)} overall median</strong>
            <span>{shortDateFormatter.format(days[0]!.startAt)}</span>
          </footer>
        ) : null}
      </section>

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
                onClick={() => onOpenDay(day.key)}
              >
                <span className="pitch-insights-day-row__date" aria-hidden>
                  <small>{monthFormatter.format(day.startAt)}</small>
                  <strong>{dayNumberFormatter.format(day.startAt)}</strong>
                </span>
                <span className="pitch-insights-day-row__copy">
                  <strong>{formatDayHeading(day)}</strong>
                  <small>
                    {plural(day.sessionCount, 'session')}
                    {' · '}{plural(day.observationCount, 'note held', 'notes held')}
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
                onClick={() => onResetDay(day)}
              >
                <RotateCcw aria-hidden />
              </Pressable>
            </article>
          ))}
        </div>
        {days.length > DAY_PREVIEW_COUNT ? (
          <button type="button" className="pitch-insights-days__more" onClick={onToggleShowAllDays}>
            {showAllDays ? 'Show recent days' : `Show all ${days.length} days`}
          </button>
        ) : null}
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
  const [overviewRoute, setOverviewRoute] = useState<'notes' | 'days' | null>(null)
  const [showAllDays, setShowAllDays] = useState(false)
  const [resettingKey, setResettingKey] = useState<string | null>(null)
  const [selectedSource, setSelectedSource] = useState<string>('all')
  const [addedInstruments, setAddedInstruments] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(ADDED_INSTRUMENTS_KEY)
      const parsed = raw ? (JSON.parse(raw) as unknown) : null
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
    } catch {
      return []
    }
  })
  const [instrumentPickerOpen, setInstrumentPickerOpen] = useState(false)

  const addInstrument = useCallback((id: string) => {
    setAddedInstruments((current) => {
      const next = current.includes(id) ? current : [...current, id]
      try {
        localStorage.setItem(ADDED_INSTRUMENTS_KEY, JSON.stringify(next))
      } catch {
        /* Private browsing must not break the filter. */
      }
      return next
    })
    setSelectedSource(id)
    setInstrumentPickerOpen(false)
  }, [])

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
      setOverviewRoute(null)
      setShowAllDays(false)
      setResettingKey(null)
      setSelectedSource(transpositionId)
    }
  }, [isOpen, tunerInstrument, transpositionId])

  // Observations are tagged with the instrument that was active when they
  // were captured. Pooling e.g. Voice and Winds tendencies for "the same"
  // note would blend two unrelated intonation habits into one misleading
  // number, so only show the filter (and apply it) once more than one
  // instrument actually shows up in the history — most players only ever
  // see one and the screen stays exactly as before.
  /* An instrument is its transposition — a trumpet and a horn both record as
     'winds', so the profile cannot tell them apart. Instruments you have played
     appear automatically; the + lets you add one before you have any history
     for it. */
  const instrumentIds = useMemo(() => {
    const ids = new Set<string>()
    for (const observation of observations) ids.add(observation.transpositionId)
    for (const id of addedInstruments) ids.add(id)
    return [...ids]
  }, [observations, addedInstruments])

  const showInstrumentFilter = instrumentIds.length > 1 || addedInstruments.length > 0
  const visibleObservations = useMemo(() => {
    if (selectedSource === 'all') return observations
    return observations.filter((observation) => observation.transpositionId === selectedSource)
  }, [observations, selectedSource])
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

  const worthReviewing = useMemo(() => rankNotesWorthReviewing(allInsights), [allInsights])
  const registerNote = useMemo(() => describeRegisterPattern(allInsights), [allInsights])

  const selected = allInsights.find((insight) => insight.midiNote === selectedMidi) ?? null
  const displayProfile = getTunerTransposition(transpositionId)
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
        message: `${plural(day.observationCount, 'note held', 'notes held')} from ${plural(day.sessionCount, 'session')} will be removed from Pitch Insights. Other days will stay intact.`,
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

  // A reset (this day, or all) can empty the practice-days or all-notes
  // sub-screen out from under the user while they're standing on it —
  // observations update asynchronously, so this can't be handled inline in
  // resetDay/resetAll. Bounce back to the overview, which already has its
  // own empty state built in.
  useEffect(() => {
    if (overviewRoute === 'days' && days.length === 0) setOverviewRoute(null)
    if (overviewRoute === 'notes' && allInsights.length === 0) setOverviewRoute(null)
  }, [overviewRoute, days.length, allInsights.length])

  const resetAll = useCallback(async () => {
    // Always clears every instrument's history, regardless of the filter
    // above — the count here is the true (unfiltered) total so the dialog
    // never understates what "Reset all" is about to delete.
    const confirmed = await showConfirm({
      title: 'Reset all Pitch Insights?',
      message: `${plural(observations.length, 'note held', 'notes held')} across ${plural(allObservationsDayCount, 'practice day')}${
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
                insights={allInsights}
                formatNoteName={formatNoteName}
                displayLabel={displayProfile.shortLabel}
                resetting={resettingKey === selectedDay.key}
                hapticFeedback={hapticFeedback}
                onBack={() => setSelectedDayKey(null)}
                onSelectNote={selectNote}
                onReset={() => void resetDay(selectedDay)}
              />
            ) : overviewRoute === 'notes' ? (
              <AllNotesScreen
                key="all-notes"
                insights={allInsights}
                formatNoteName={formatNoteName}
                labelSummary={`${displayProfile.shortLabel} labels`}
                onBack={() => setOverviewRoute(null)}
                onSelectNote={selectNote}
              />
            ) : overviewRoute === 'days' ? (
              <PracticeDaysScreen
                key="practice-days"
                days={days}
                visibleDays={visibleDays}
                showAllDays={showAllDays}
                overallMedian={overallMedian}
                allTimePoints={allTimePoints}
                resettingKey={resettingKey}
                hapticFeedback={hapticFeedback}
                onBack={() => setOverviewRoute(null)}
                onToggleShowAllDays={() => setShowAllDays((current) => !current)}
                onOpenDay={(dayKey) => {
                  triggerLightHaptic(hapticFeedback)
                  setSelectedDayKey(dayKey)
                }}
                onResetDay={(day) => void resetDay(day)}
                onResetAll={() => void resetAll()}
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
                      Every note you hold steady gets logged here, so you can see which
                      pitches drift and which sit true.
                    </p>
                  </div>
                ) : (
                  <>
                    <PitchInsightsHero observations={scopedObservations} registerNote={registerNote} />

                    {true ? (
                      <div
                        className="pitch-insights-instrument-filter"
                        role="tablist"
                        aria-label="Filter Pitch Insights by instrument"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={selectedSource === 'all'}
                          className={`pitch-insights-instrument-filter__pill ${
                            selectedSource === 'all' ? 'is-active' : ''
                          }`}
                          onClick={() => {
                            triggerLightHaptic(hapticFeedback)
                            setSelectedSource('all')
                          }}
                        >
                          All instruments
                        </button>
                        {instrumentIds.map((id) => (
                          <button
                            key={id}
                            type="button"
                            role="tab"
                            aria-selected={selectedSource === id}
                            className={`pitch-insights-instrument-filter__pill ${
                              selectedSource === id ? 'is-active' : ''
                            }`}
                            onClick={() => {
                              triggerLightHaptic(hapticFeedback)
                              setSelectedSource(id)
                            }}
                          >
                            {getTunerTransposition(id as TunerTranspositionId).shortLabel}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="pitch-insights-instrument-filter__pill pitch-insights-instrument-filter__add"
                          onClick={() => {
                            triggerLightHaptic(hapticFeedback)
                            setInstrumentPickerOpen(true)
                          }}
                          aria-label="Add an instrument"
                        >
                          <Plus aria-hidden />
                        </button>
                      </div>
                    ) : null}

                    {instrumentPickerOpen ? (
                      <div className="pitch-insights-instrument-picker" role="dialog" aria-label="Add an instrument">
                        <header>
                          <strong>Add an instrument</strong>
                          <button
                            type="button"
                            onClick={() => setInstrumentPickerOpen(false)}
                            aria-label="Close"
                          >
                            <X aria-hidden />
                          </button>
                        </header>
                        <div>
                          {TUNER_TRANSPOSITION_OPTIONS.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              className={instrumentIds.includes(option.id) ? 'is-added' : ''}
                              onClick={() => addInstrument(option.id)}
                            >
                              <span>{option.keyLabel}</span>
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {worthReviewing.length > 0 ? (
                      <section className="pitch-insights-list" aria-label="Notes worth reviewing">
                        <header>
                          <div>
                            <span>Worth a look</span>
                            <strong>Your least centered pitches</strong>
                          </div>
                        </header>
                        <div className="pitch-insights-list__rows">
                          {worthReviewing.map((insight) => (
                            <PitchInsightsNoteRow
                              key={insight.midiNote}
                              insight={insight}
                              formatNoteName={formatNoteName}
                              onSelect={selectNote}
                            />
                          ))}
                        </div>
                      </section>
                    ) : null}

                    <section className="pitch-insights-list" aria-label="More">
                      <header>
                        <div>
                          <span>More</span>
                        </div>
                      </header>
                      <div className="pitch-insights-list__rows">
                        <button
                          type="button"
                          className="pitch-insights-link-row"
                          onClick={() => {
                            triggerLightHaptic(hapticFeedback)
                            setOverviewRoute('notes')
                          }}
                        >
                          <div className="pitch-insights-link-row__copy">
                            <strong>All notes</strong>
                            <span>Every pitch you’ve held</span>
                          </div>
                          <span className="pitch-insights-link-row__count">
                            {plural(allInsights.length, 'note')}
                          </span>
                          <ChevronRight aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="pitch-insights-link-row"
                          onClick={() => {
                            triggerLightHaptic(hapticFeedback)
                            setOverviewRoute('days')
                          }}
                        >
                          <div className="pitch-insights-link-row__copy">
                            <strong>Practice days</strong>
                            <span>Sessions grouped by date</span>
                          </div>
                          <span className="pitch-insights-link-row__count">
                            {plural(days.length, 'day')}
                          </span>
                          <ChevronRight aria-hidden />
                        </button>
                      </div>
                    </section>
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
