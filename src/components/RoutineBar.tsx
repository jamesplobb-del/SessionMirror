import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import {
  AnimatePresence,
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
} from 'framer-motion'
import {
  Check,
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  House,
  Pause,
  Pencil,
  Play,
  SkipForward,
  X,
} from 'lucide-react'
import Pressable from './ui/Pressable'
import RoutineProgramControls from './RoutineProgramControls'
import { triggerLightHaptic } from '../utils/haptics'
import { iosDragRelease, iosSpringSnappy } from '../utils/motionPresets'
import {
  clampWidgetPosition,
  loadWidgetPosition,
  loadWidgetSize,
  saveWidgetPosition,
  saveWidgetSize,
} from '../utils/floatingWidgetLayout'
import type { TunerTranspositionId } from '../utils/tunerTransposition'
import {
  formatElapsed,
  formatMinutes,
  isStepDone,
  isStepSkipped,
  routineProgress,
  summarizeStep,
  type Routine,
  type RoutineDay,
  type RoutineStep,
} from '../utils/practiceRoutines'

interface RoutineBarProps {
  routine: Routine
  day: RoutineDay | null
  /** The step in flight, running or paused. */
  step: RoutineStep
  nextStep: RoutineStep | null
  /** Replaces the step's own length — the daily challenge is always one minute. */
  goalMs?: number
  elapsedMs?: number
  startedAt: number | null
  paused: boolean
  busy?: boolean
  /** Light surface on the audio tools; dark glass over the camera. */
  audioSurface: boolean
  /** Games sit at z-index 135; the bar has to clear them. */
  overLabs?: boolean
  tunerTransposition: TunerTranspositionId
  hapticFeedback: boolean
  onResume: () => void
  onPause: () => void
  onClose: () => void
  onDone: () => void
  /** Left out where skipping means nothing, like the one-step daily challenge. */
  onSkip?: () => void
  onJumpToStep: (stepId: string) => void
  onEditRoutine?: () => void
  onOpenToday: () => void
}

interface Insets {
  top: number
  bottom: number
}

interface Spot {
  x: number
  y: number
}

interface Room {
  side: 'above' | 'below'
  maxHeight: number
}

const POSITION_ID = 'routine-bar'
const BALL_POSITION_ID = 'routine-bar-ball'
const FOLDED_KEY = 'besttake:routine-bar-folded:v1'
const EDGE = 12
const MIN_WIDTH = 264
const MAX_WIDTH = 560
const DEFAULT_WIDTH = 304
/** Narrower than this the bar folds to one row and its buttons drop their words. */
const COMPACT_BELOW = 330
/** Matches `.routine-ball` (4rem). */
const BALL_SIZE = 64
/** Space above the bar for the floating collapse control. */
const COLLAPSE_HEADROOM = 36
/** First run sits just above the control deck, where the bar used to be pinned. */
const DEFAULT_BOTTOM_GAP = 124
const KEY_STEP = 16
const ARROWS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}
/** The step list opens on whichever side of the bar has room for it. */
const PANEL_GAP = 6
const PANEL_IDEAL = 300
const PANEL_MAX = 440
const PANEL_MIN = 140

function readSafeInsets(): Insets {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;' +
    'padding-top:var(--safe-top,0px);padding-bottom:var(--safe-bottom,0px)'
  document.body.appendChild(probe)
  const style = window.getComputedStyle(probe)
  const insets = { top: parseFloat(style.paddingTop) || 0, bottom: parseFloat(style.paddingBottom) || 0 }
  probe.remove()
  return insets
}

/** The shared widget clamp, kept clear of the notch and the home indicator. */
function clampToViewport(x: number, y: number, width: number, height: number, insets: Insets): Spot {
  const clamped = clampWidgetPosition(
    window.innerWidth,
    window.innerHeight - insets.top - insets.bottom,
    width,
    height,
    x,
    y - insets.top,
  )
  return { x: clamped.x, y: Math.max(clamped.y + insets.top, insets.top + EDGE + (width === BALL_SIZE ? 0 : COLLAPSE_HEADROOM)) }
}

function clampWidth(width: number): number {
  const room = Math.max(0, window.innerWidth - EDGE * 2)
  const min = Math.min(MIN_WIDTH, room)
  const max = Math.max(min, Math.min(MAX_WIDTH, room))
  return Math.round(Math.min(max, Math.max(min, width)))
}

function roomFor(top: number, height: number, insets: Insets): Room {
  const below = window.innerHeight - insets.bottom - EDGE - (top + height) - PANEL_GAP
  const above = top - insets.top - EDGE - PANEL_GAP - COLLAPSE_HEADROOM
  const side = below >= PANEL_IDEAL || below >= above ? 'below' : 'above'
  const space = side === 'below' ? below : above
  return { side, maxHeight: Math.round(Math.max(PANEL_MIN, Math.min(PANEL_MAX, space))) }
}

/** Folding is a choice for this session: it survives recording a take, not a relaunch. */
function loadFolded(): boolean {
  try {
    return sessionStorage.getItem(FOLDED_KEY) === '1'
  } catch {
    return false
  }
}

function saveFolded(folded: boolean): void {
  try {
    if (folded) sessionStorage.setItem(FOLDED_KEY, '1')
    else sessionStorage.removeItem(FOLDED_KEY)
  } catch {
    /* private mode */
  }
}

/**
 * The routine's presence while a step runs: which step, how long, and the two
 * things a player does mid-step — pause, or finish and move on.
 *
 * It floats rather than docks. Drag it by the grip or the title. Drag the corner
 * to set the width (narrow enough and the bar folds to one row). The control above
 * the bar folds it into a ball that shows the step and its timer.
 * The ball drags the same way; tap it to open the bar again from the
 * ball's corner. Where each was left is remembered, like the metronome and
 * drone widgets. Position is owned entirely by x/y motion values: CSS centring
 * once fought the entry animation's transform and put the bar half off screen.
 *
 * Tapping the title drops the whole routine down beside the bar, on whichever
 * side has room, so the bar itself never moves. Looking at the list stops
 * nothing — the click and the drone keep going until a step actually changes.
 */
export default function RoutineBar({
  routine,
  day,
  step,
  nextStep,
  goalMs,
  elapsedMs = 0,
  startedAt,
  paused,
  busy = false,
  audioSurface,
  overLabs = false,
  tunerTransposition,
  hapticFeedback,
  onResume,
  onPause,
  onClose,
  onDone,
  onSkip,
  onJumpToStep,
  onEditRoutine,
  onOpenToday,
}: RoutineBarProps) {
  const reducedMotion = useReducedMotion()
  const panelId = useId()
  /** The bar or the ball — whichever is showing. They never exist together. */
  const nodeRef = useRef<HTMLElement | null>(null)
  const setNode = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node
  }, [])
  const toggleRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLOListElement | null>(null)
  const dragControls = useDragControls()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  /** Where the player left it. Viewport clamps apply on top and never overwrite it. */
  const restRef = useRef<Spot | null>(null)
  const insetsRef = useRef<Insets>({ top: 0, bottom: 0 })
  /** The unfolded bar's last height, so the ball can open it from the right corner. */
  const barHeightRef = useRef(0)
  const draggingRef = useRef(false)
  /** Set by a drag so the click that ends it does not also toggle anything. */
  const draggedRef = useRef(false)
  const [width, setWidth] = useState(() => clampWidth(loadWidgetSize(POSITION_ID)?.width ?? DEFAULT_WIDTH))
  const [folded, setFolded] = useState(loadFolded)
  const foldedRef = useRef(folded)
  foldedRef.current = folded
  const [open, setOpen] = useState(false)
  const openRef = useRef(open)
  openRef.current = open
  const [room, setRoom] = useState<Room>({ side: 'above', maxHeight: PANEL_IDEAL })
  const [dragging, setDragging] = useState(false)
  const [now, setNow] = useState(Date.now)
  const compact = width < COMPACT_BELOW

  useEffect(() => {
    setNow(Date.now())
    if (!startedAt || paused) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt, paused])

  // Every step starts with the list folded away.
  useEffect(() => {
    setOpen(false)
  }, [step.id])

  const place = useCallback(() => {
    const el = nodeRef.current
    const rest = restRef.current
    if (!el || !rest || draggingRef.current) return
    const next = clampToViewport(rest.x, rest.y, el.offsetWidth, el.offsetHeight, insetsRef.current)
    x.stop()
    y.stop()
    x.set(next.x)
    y.set(next.y)
  }, [x, y])

  /** Adopt wherever it now sits, clamped, as the spot to come back to. */
  const rememberSpot = useCallback(() => {
    const el = nodeRef.current
    if (!el) return null
    const next = clampToViewport(x.get(), y.get(), el.offsetWidth, el.offsetHeight, insetsRef.current)
    restRef.current = next
    saveWidgetPosition(foldedRef.current ? BALL_POSITION_ID : POSITION_ID, next.x, next.y)
    return next
  }, [x, y])

  // First mount restores the saved spot; folding and unfolding have already
  // set theirs by the time the other shape mounts, so they only need clamping.
  useLayoutEffect(() => {
    const el = nodeRef.current
    if (!el) return
    insetsRef.current = readSafeInsets()
    if (!restRef.current) {
      restRef.current = loadWidgetPosition(folded ? BALL_POSITION_ID : POSITION_ID) ?? {
        x: folded ? window.innerWidth - EDGE - el.offsetWidth : (window.innerWidth - el.offsetWidth) / 2,
        y: window.innerHeight - DEFAULT_BOTTOM_GAP - el.offsetHeight,
      }
    }
    if (!folded) barHeightRef.current = el.offsetHeight
    place()
  }, [folded, place])

  // Folding to one row, a longer title or the timer track all change the size.
  // Keep it on screen without forgetting where it was put.
  useEffect(() => {
    const el = nodeRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let frame = 0
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        if (!foldedRef.current && nodeRef.current) barHeightRef.current = nodeRef.current.offsetHeight
        place()
      })
    })
    observer.observe(el)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [folded, place])

  useEffect(() => {
    const onViewportChange = () => {
      insetsRef.current = readSafeInsets()
      setWidth((current) => clampWidth(current))
      window.requestAnimationFrame(place)
      const el = nodeRef.current
      if (openRef.current && el) setRoom(roomFor(y.get(), el.offsetHeight, insetsRef.current))
    }
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('orientationchange', onViewportChange)
    return () => {
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('orientationchange', onViewportChange)
    }
  }, [place, y])

  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector<HTMLElement>('[aria-current="step"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [open])

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    draggedRef.current = false
    if (event.button !== 0 || !event.isPrimary) return
    if ((event.target as HTMLElement).closest('[data-no-drag]')) return
    dragControls.start(event)
  }

  const onDragStart = () => {
    draggingRef.current = true
    draggedRef.current = true
    setDragging(true)
  }

  const endDrag = () => {
    draggingRef.current = false
    setDragging(false)
    const el = nodeRef.current
    const next = rememberSpot()
    if (!el || !next) return
    if (reducedMotion) {
      x.set(next.x)
      y.set(next.y)
    } else {
      void animate(x, next.x, iosDragRelease)
      void animate(y, next.y, iosDragRelease)
    }
    if (openRef.current) setRoom(roomFor(next.y, el.offsetHeight, insetsRef.current))
  }

  const toggle = () => {
    if (draggedRef.current) {
      draggedRef.current = false
      return
    }
    triggerLightHaptic(hapticFeedback)
    const el = nodeRef.current
    if (!open && el) setRoom(roomFor(y.get(), el.offsetHeight, insetsRef.current))
    setOpen(!open)
  }

  const close = (returnFocus = false) => {
    setOpen(false)
    if (returnFocus) toggleRef.current?.focus({ preventScroll: true })
  }

  const moveWithKeys = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const arrow = ARROWS[event.key]
    const el = nodeRef.current
    const rest = restRef.current
    if (!arrow || !el || !rest) return
    event.preventDefault()
    const next = clampToViewport(
      rest.x + arrow[0] * KEY_STEP,
      rest.y + arrow[1] * KEY_STEP,
      el.offsetWidth,
      el.offsetHeight,
      insetsRef.current,
    )
    restRef.current = next
    x.set(next.x)
    y.set(next.y)
    saveWidgetPosition(foldedRef.current ? BALL_POSITION_ID : POSITION_ID, next.x, next.y)
  }

  /** Into the ball, anchored at the bar's lower-right corner. */
  const fold = () => {
    const el = nodeRef.current
    if (!el) return
    triggerLightHaptic(hapticFeedback)
    barHeightRef.current = el.offsetHeight
    const next = clampToViewport(
      x.get() + el.offsetWidth - BALL_SIZE,
      y.get() + el.offsetHeight - BALL_SIZE,
      BALL_SIZE,
      BALL_SIZE,
      insetsRef.current,
    )
    restRef.current = next
    saveWidgetPosition(BALL_POSITION_ID, next.x, next.y)
    setOpen(false)
    setFolded(true)
    saveFolded(true)
  }

  /** Back to the bar, opening from the ball's corner wherever the ball was taken. */
  const unfold = () => {
    if (draggedRef.current) {
      draggedRef.current = false
      return
    }
    const el = nodeRef.current
    if (!el) return
    triggerLightHaptic(hapticFeedback)
    const barHeight = barHeightRef.current || 104
    const next = clampToViewport(
      x.get() + el.offsetWidth - width,
      y.get() + el.offsetHeight - barHeight,
      width,
      barHeight,
      insetsRef.current,
    )
    restRef.current = next
    saveWidgetPosition(POSITION_ID, next.x, next.y)
    setFolded(false)
    saveFolded(false)
  }

  const expandedWidth = clampWidth(400)
  const widthExpanded = width >= expandedWidth - 1
  const toggleWidth = () => {
    triggerLightHaptic(hapticFeedback)
    const next = widthExpanded ? clampWidth(MIN_WIDTH) : expandedWidth
    setWidth(next)
    saveWidgetSize(POSITION_ID, next, nodeRef.current?.offsetHeight ?? 0)
  }

  if (typeof document === 'undefined') return null

  const index = Math.max(1, routine.steps.findIndex((item) => item.id === step.id) + 1)
  const count = routine.steps.length
  const elapsed = elapsedMs + (!paused && startedAt ? Math.max(0, now - startedAt) : 0)
  const targetMs = goalMs ?? step.minutes * 60_000
  const over = targetMs > 0 && elapsed >= targetMs
  const fraction = targetMs > 0 ? Math.min(1, elapsed / targetMs) : 0
  const time = targetMs > 0 ? `${formatElapsed(elapsed)} / ${formatElapsed(targetMs)}` : formatElapsed(elapsed)
  // One row has no room for the target; the track under it still shows it.
  const clock = compact
    ? `${index}/${count} · ${paused ? 'Paused' : formatElapsed(elapsed)}`
    : paused
      ? `Paused · ${time}`
      : time
  const doneLabel = busy ? 'Saving…' : nextStep ? 'Done & next' : 'Finish routine'
  const progress = routineProgress(routine, day)
  const status = progress.complete
    ? 'All done'
    : `${progress.done} of ${progress.total} done${progress.minutesLeft > 0 ? ` · ${formatMinutes(progress.minutesLeft)} left` : ''}`

  if (folded) {
    return createPortal(
      <motion.button
        key="ball"
        ref={setNode}
        type="button"
        className={[
          'routine-ball',
          audioSurface && 'routine-ball--audio',
          overLabs && 'routine-bar--over-labs',
          paused && 'is-paused',
          over && 'is-over',
          dragging && 'is-dragging',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={`Routine: ${step.title}, step ${index} of ${count}${paused ? ', paused' : ''}. Open the routine bar.`}
        style={{ x, y }}
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        dragElastic={0}
        onPointerDown={startDrag}
        onDragStart={onDragStart}
        onDragEnd={endDrag}
        onClick={unfold}
        onKeyDown={moveWithKeys}
        initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={iosSpringSnappy}
      >
        <svg className="routine-ball__ring" viewBox="0 0 52 52" aria-hidden>
          <circle className="routine-ball__track" cx="26" cy="26" r="24" />
          {targetMs > 0 && (
            <circle
              className="routine-ball__progress"
              cx="26"
              cy="26"
              r="24"
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={1 - fraction}
            />
          )}
        </svg>
        <span className="routine-ball__label">Routine</span>
        <span className="routine-ball__step">
          {index}
          <small>/{count}</small>
        </span>
        <span className="routine-ball__time">{paused ? 'Paused' : formatElapsed(elapsed)}</span>
      </motion.button>,
      document.body,
    )
  }

  const actions = (
    <>
      <Pressable
        type="button"
        intensity="soft"
        haptic={false}
        className="routine-bar__action"
        data-no-drag
        disabled={busy}
        aria-label={paused ? 'Resume routine' : 'Pause routine'}
        onClick={paused ? onResume : onPause}
      >
        {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
        {!compact && <span>{paused ? 'Resume' : 'Pause'}</span>}
      </Pressable>
      <Pressable
        type="button"
        intensity="soft"
        haptic={false}
        className="routine-bar__action is-primary"
        data-no-drag
        disabled={busy}
        aria-label={doneLabel}
        onClick={onDone}
      >
        <Check aria-hidden />
        {!compact && <span>{doneLabel}</span>}
      </Pressable>
    </>
  )

  return createPortal(
    <>
      {open && (
        <div
          className={`routine-bar-scrim ${overLabs ? 'routine-bar-scrim--over-labs' : ''}`}
          aria-hidden
          onClick={() => close()}
        />
      )}
      <motion.section
        key="bar"
        ref={setNode}
        className={[
          'routine-bar',
          audioSurface && 'routine-bar--audio',
          overLabs && 'routine-bar--over-labs',
          compact && 'is-compact',
          open && 'is-open',
          over && 'is-over',
          dragging && 'is-dragging',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={`Routine: ${routine.name}`}
        style={{ x, y, width }}
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        dragElastic={0}
        onDragStart={onDragStart}
        onDragEnd={endDrag}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={iosSpringSnappy}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !open) return
          event.stopPropagation()
          close(true)
        }}
      >
        <button
          type="button"
          className="routine-bar__collapse"
          aria-label="Collapse routine"
          title="Collapse routine"
          data-no-drag
          onPointerDown={event => event.stopPropagation()}
          onClick={fold}
        >
          <ChevronUp aria-hidden />
        </button>
        <div className="routine-bar__toolbar">
          <button
            type="button"
            className="routine-bar__grip"
            aria-label="Move the routine bar. Use the arrow keys."
            onPointerDown={startDrag}
            onKeyDown={moveWithKeys}
          >
            <GripHorizontal aria-hidden />
          </button>
          <button type="button" className="routine-bar__size" data-no-drag
            aria-label={widthExpanded ? 'Compact routine widget' : 'Expand routine widget'}
            aria-pressed={widthExpanded} onClick={toggleWidth}>
            {widthExpanded ? 'Compact' : 'Expand'}
          </button>
        </div>

        <div className="routine-bar__head" onPointerDown={startDrag}>
          <button
            ref={toggleRef}
            type="button"
            className="routine-bar__toggle"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={`${step.title}, step ${index} of ${count}. ${open ? 'Hide' : 'Show'} the routine.`}
            onClick={toggle}
          >
            {!compact && (
              <span className="routine-bar__step">
                {index}
                <small>/{count}</small>
              </span>
            )}
            <span className="routine-bar__text">
              <span className="routine-bar__title">{step.title}</span>
              <span className="routine-bar__clock">{clock}</span>
            </span>
            <ChevronDown className="routine-bar__chevron" aria-hidden />
          </button>
          {compact && actions}
          <button
            type="button"
            className="routine-bar__close"
            aria-label="Close routine"
            title="End this routine session"
            disabled={busy}
            data-no-drag
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
          >
            <X aria-hidden />
          </button>
        </div>

        {targetMs > 0 && (
          <span className="routine-bar__track" aria-hidden>
            <i style={{ transform: `scaleX(${fraction})` }} />
          </span>
        )}

        {!compact && <div className="routine-bar__actions">{actions}</div>}

        {step.programId && step.kind !== 'game' && step.kind !== 'free' && (
          <RoutineProgramControls key={step.id} programId={step.programId} disabled={Boolean(busy || paused)} />
        )}

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="panel"
              id={panelId}
              className={`routine-bar__panel routine-bar__panel--${room.side}`}
              style={{ maxHeight: room.maxHeight }}
              initial={{ opacity: 0, y: reducedMotion ? 0 : room.side === 'below' ? -6 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reducedMotion ? 0 : room.side === 'below' ? -6 : 6 }}
              transition={{ duration: reducedMotion ? 0 : 0.16, ease: [0.32, 0.72, 0, 1] }}
            >
              <header className="routine-bar__panel-head">
                <span className="routine-bar__eyebrow">{routine.name}</span>
                <span className="routine-bar__panel-status">{status}</span>
              </header>

              <ol ref={listRef} className="routine-bar__steps" aria-label={`${routine.name} steps`}>
                {routine.steps.map((item, itemIndex) => {
                  const current = item.id === step.id
                  const done = !current && isStepDone(day, item.id)
                  const skipped = !current && !done && isStepSkipped(day, item.id)
                  const summary = summarizeStep(item, tunerTransposition) || formatMinutes(item.minutes)
                  return (
                    <li
                      key={item.id}
                      className={`routine-bar__row${current ? ' is-current' : done ? ' is-done' : skipped ? ' is-skipped' : ''}`}
                      aria-current={current ? 'step' : undefined}
                    >
                      <button
                        type="button"
                        disabled={busy && !current}
                        aria-label={
                          current
                            ? `${item.title}. The current step.`
                            : `${done ? 'Done. ' : skipped ? 'Skipped. ' : ''}Go to ${item.title}`
                        }
                        onClick={() => {
                          close()
                          if (!current) onJumpToStep(item.id)
                        }}
                      >
                        <span className="routine-bar__marker" aria-hidden>
                          {done ? <Check /> : itemIndex + 1}
                        </span>
                        <span className="routine-bar__row-copy">
                          <strong>{item.title}</strong>
                          <small>{skipped ? `Skipped · ${summary}` : summary}</small>
                        </span>
                        {current && <em>{paused ? 'Paused' : 'Now'}</em>}
                      </button>
                    </li>
                  )
                })}
              </ol>

              <footer className="routine-bar__panel-actions">
                {onSkip && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      close()
                      onSkip()
                    }}
                  >
                    <SkipForward aria-hidden />
                    <span>Skip step</span>
                  </button>
                )}
                {onEditRoutine && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label="Edit routine"
                    onClick={() => {
                      close()
                      triggerLightHaptic(hapticFeedback)
                      onEditRoutine()
                    }}
                  >
                    <Pencil aria-hidden />
                    <span>Edit</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  aria-label="Open Practice Home"
                  onClick={() => {
                    close()
                    triggerLightHaptic(hapticFeedback)
                    onOpenToday()
                  }}
                >
                  <House aria-hidden />
                  <span>Home</span>
                </button>
              </footer>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </>,
    document.body,
  )
}
