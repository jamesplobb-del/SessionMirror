import { AnimatePresence, motion } from 'framer-motion'
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Minus,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  summarizePitchPracticeDays,
  type NotePitchInsight,
  type PitchPracticeDaySummary,
} from '../../utils/pitchInsightsAnalytics'
import { triggerLightHaptic } from '../../utils/haptics'
import { iosSpringSnappy, motionGpuLayer } from '../../utils/motionPresets'
import {
  getTunerTransposition,
  type TunerTranspositionId,
} from '../../utils/tunerTransposition'
import Pressable from '../ui/Pressable'

interface PitchInsightsScreenProps {
  isOpen: boolean
  onClose: () => void
  transpositionId?: TunerTranspositionId
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

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

function confidenceLabel(insight: NotePitchInsight): string {
  switch (insight.confidence) {
    case 'established':
      return 'Established tendency'
    case 'early':
      return 'Early tendency'
    default:
      return 'Collecting data'
  }
}

function tendencyLabel(insight: NotePitchInsight): string {
  if (insight.confidence === 'collecting') return 'Collecting data'
  if (insight.consistency !== 'Variable') return insight.tendency
  return insight.tendency === 'Centered'
    ? 'Variable around center'
    : `${insight.tendency} · variable`
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
}: {
  points: CentsGraphPoint[]
  ariaLabel: string
  emptyMessage?: string
}) {
  const reduced = reduceGraphPoints(points)
  if (reduced.length === 0) {
    return <div className="pitch-insights-trend__empty">{emptyMessage}</div>
  }

  const width = 360
  const height = 118
  const insetX = 12
  const insetY = 10
  const usableWidth = width - insetX * 2
  const usableHeight = height - insetY * 2
  const firstTimestamp = reduced[0]!.timestamp
  const lastTimestamp = reduced[reduced.length - 1]!.timestamp
  const timeSpan = Math.max(1, lastTimestamp - firstTimestamp)
  const positionFor = (point: CentsGraphPoint, index: number) => {
    const x = reduced.length === 1
      ? width / 2
      : insetX + ((point.timestamp - firstTimestamp) / timeSpan) * usableWidth
    const clamped = Math.max(-30, Math.min(30, point.cents))
    const y = insetY + ((30 - clamped) / 60) * usableHeight
    return { x, y, index }
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
      <span className="pitch-insights-graph-label pitch-insights-graph-label--sharp">Sharp</span>
      <svg
        className="pitch-insights-trend"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="none"
      >
        <title>{ariaLabel}</title>
        <rect
          className="pitch-insights-trend__center-zone"
          x={insetX}
          y={inTuneTop}
          width={usableWidth}
          height={inTuneBottom - inTuneTop}
          rx="3"
        />
        <line x1={insetX} y1={height / 2} x2={width - insetX} y2={height / 2} />
        {reduced.length > 1 ? <path d={path} /> : null}
        {positions.map(({ x, y }, index) =>
          showEveryPoint || index === 0 || index === positions.length - 1 ? (
            <circle key={reduced[index]!.id} cx={x} cy={y} r="2.7" />
          ) : null,
        )}
      </svg>
      <span className="pitch-insights-graph-label pitch-insights-graph-label--flat">Flat</span>
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
          <span>Note history</span>
          <strong>{plural(insights.length, 'pitch', 'pitches')}</strong>
        </div>
        <small>{labelSummary}</small>
      </header>
      <div className="pitch-insights-list__rows">
        {insights.map((insight) => {
          const displayName = formatNoteName(insight.midiNote, insight.noteName)
          return (
            <button
              key={insight.midiNote}
              type="button"
              className="pitch-insights-row"
              onClick={() => onSelect(insight.midiNote)}
            >
              <strong className="pitch-insights-row__note">{displayName}</strong>
              <div className="pitch-insights-row__copy">
                <strong>{tendencyLabel(insight)}</strong>
                <span>
                  {plural(insight.observationCount, 'observation')}
                  {' · '}{confidenceLabel(insight)}
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
          <small>{confidenceLabel(insight)}</small>
        </article>
        <article>
          <span>Consistency</span>
          <strong>{hasTendency ? insight.consistency : '—'}</strong>
          <small>
            {hasTendency
              ? `Typical spread ${Math.round(insight.typicalVariability)}¢`
              : 'More stable notes needed'}
          </small>
        </article>
      </div>

      <section className="pitch-insights-detail__trend-card">
        <header>
          <div>
            <span>Pitch pattern</span>
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
          {day.sessions.map((session) => (
            <div className="pitch-insights-session-row" key={session.id}>
              <div>
                <strong>{sessionTimeRange(session.startedAt, session.endedAt)}</strong>
                <span>
                  {plural(session.observationCount, 'stable note')}
                  {' · '}{plural(session.pitchCount, 'pitch', 'pitches')}
                </span>
              </div>
              <strong>{formatCents(session.typicalCents)}</strong>
            </div>
          ))}
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
  formatNoteName = (_midiNote, fallback) => fallback,
  hapticFeedback = true,
}: PitchInsightsScreenProps) {
  const { showAlert, showConfirm } = useActionSheet()
  const [observations, setObservations] = useState<PitchObservation[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null)
  const [selectedMidi, setSelectedMidi] = useState<number | null>(null)
  const [showAllDays, setShowAllDays] = useState(false)
  const [resettingKey, setResettingKey] = useState<string | null>(null)
  const dialogRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const onCloseRef = useRef(onClose)
  const loadSequenceRef = useRef(0)
  const activeRef = useRef(false)
  const fallbackReloadTimerRef = useRef<number | null>(null)
  const liveUpdateTimerRef = useRef<number | null>(null)
  const pendingSavedRef = useRef<PitchObservation[]>([])
  onCloseRef.current = onClose

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

      // Coalesce legacy/untyped events instead of re-reading the all-time table
      // once per stable note.
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
      setShowAllDays(false)
      setResettingKey(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const appRoot = document.getElementById('root')
    const previousOverflow = document.body.style.overflow
    const previousAriaHidden = appRoot?.getAttribute('aria-hidden') ?? null
    const previousInert = appRoot?.inert ?? false
    document.body.style.overflow = 'hidden'
    if (appRoot) {
      appRoot.inert = true
      appRoot.setAttribute('aria-hidden', 'true')
    }

    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute('hidden'))
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (appRoot) {
        appRoot.inert = previousInert
        if (previousAriaHidden == null) appRoot.removeAttribute('aria-hidden')
        else appRoot.setAttribute('aria-hidden', previousAriaHidden)
      }
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [isOpen])

  const days = useMemo(() => summarizePitchPracticeDays(observations), [observations])
  const selectedDay = days.find((day) => day.key === selectedDayKey) ?? null
  const scopedObservations = selectedDay?.observations ?? observations
  const insights = useMemo(
    () => aggregatePitchInsights(scopedObservations),
    [scopedObservations],
  )
  const selected = insights.find((insight) => insight.midiNote === selectedMidi) ?? null
  const displayProfile = getTunerTransposition(transpositionId)
  const sessionCount = useMemo(
    () => days.reduce((sum, day) => sum + day.sessionCount, 0),
    [days],
  )
  const overallMedian = useMemo(
    () => median(observations.map((observation) => observation.centsOffset)),
    [observations],
  )
  const allTimePoints = useMemo(
    () => [...days].reverse().map((day) => ({
      id: day.key,
      timestamp: day.startAt,
      cents: day.typicalCents,
    })),
    [days],
  )
  const visibleDays = showAllDays ? days : days.slice(0, DAY_PREVIEW_COUNT)

  const selectNote = useCallback((midiNote: number) => {
    triggerLightHaptic(hapticFeedback)
    setSelectedMidi(midiNote)
  }, [hapticFeedback])

  const resetDay = useCallback(async (day: PitchPracticeDaySummary) => {
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
  }, [selectedDayKey, showAlert, showConfirm])

  const resetAll = useCallback(async () => {
    const confirmed = await showConfirm({
      title: 'Reset all Pitch Insights?',
      message: `${plural(observations.length, 'stable note')} across ${plural(days.length, 'practice day')} will be permanently removed from this device.`,
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
  }, [days.length, observations.length, showAlert, showConfirm])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.section
          ref={dialogRef}
          className="pitch-insights-screen"
          role="dialog"
          aria-modal="true"
          aria-label="Pitch Insights"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={iosSpringSnappy}
          style={motionGpuLayer}
        >
          <header className="pitch-insights-screen__topbar">
            <div>
              <BarChart3 aria-hidden />
              <span>Pitch Insights</span>
            </div>
            <Pressable
              ref={closeButtonRef}
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
                  insights={insights}
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
                  <section className="pitch-insights-intro">
                    <span>On this device · {displayProfile.shortLabel} labels</span>
                    <h1>Your pitch over time.</h1>
                    <p>
                      Pitch Insights saves stable-note measurements from the tuner. Open a day
                      to see its sessions, graph, and note details.
                    </p>
                    {observations.length > 0 ? (
                      <div className="pitch-insights-intro__stats">
                        <span><strong>{days.length}</strong> practice days</span>
                        <span><strong>{sessionCount}</strong> sessions</span>
                        <span><strong>{observations.length}</strong> stable notes</span>
                      </div>
                    ) : null}
                  </section>

                  {loading ? (
                    <div className="pitch-insights-state" role="status">
                      <span className="pitch-insights-state__spinner" />
                      Loading pitch history…
                    </div>
                  ) : loadError ? (
                    <div className="pitch-insights-state">
                      <Clock3 aria-hidden />
                      <strong>Pitch history is temporarily unavailable.</strong>
                      <button type="button" onClick={() => void load()}>Try again</button>
                    </div>
                  ) : days.length === 0 ? (
                    <div className="pitch-insights-state pitch-insights-state--empty">
                      <BarChart3 aria-hidden />
                      <strong>Practice with the tuner to begin.</strong>
                      <p>Your practice days will appear here after you hold clear, stable notes.</p>
                    </div>
                  ) : (
                    <>
                      <section className="pitch-insights-days" aria-label="Practice days">
                        <header>
                          <div>
                            <span>Practice days</span>
                            <strong>{plural(days.length, 'day')}</strong>
                          </div>
                          <small>Open a day for its sessions</small>
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
                            <span>All-time graph</span>
                            <strong>Daily median pitch</strong>
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
                        />
                        <footer>
                          <span>{shortDateFormatter.format(days[days.length - 1]!.startAt)}</span>
                          <strong>{formatCents(overallMedian)} overall</strong>
                          <span>{shortDateFormatter.format(days[0]!.startAt)}</span>
                        </footer>
                      </section>

                      <PitchNoteList
                        insights={insights}
                        formatNoteName={formatNoteName}
                        labelSummary={`${displayProfile.shortLabel} labels · all time`}
                        onSelect={selectNote}
                      />
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
