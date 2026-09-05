import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useMotionValue } from 'framer-motion'
import { Check, ChevronDown, ChevronUp, GripVertical, ListChecks, Pause, SkipForward } from 'lucide-react'
import Pressable from './ui/Pressable'
import { iosSpringSnappy } from '../utils/motionPresets'
import type { TunerTranspositionId } from '../utils/tunerTransposition'
import { formatElapsed, summarizeStep, type RoutineStep } from '../utils/practiceRoutines'
import {
  clampWidgetPosition,
  getFloatingWidgetTopCenter,
  loadWidgetPosition,
  loadWidgetSize,
  saveWidgetPosition,
  saveWidgetSize,
} from '../utils/floatingWidgetLayout'

interface RoutineBarProps {
  step: RoutineStep
  /** 1-based. */
  stepIndex: number
  stepCount: number
  nextStep: RoutineStep | null
  startedAt: number | null
  expanded: boolean
  /** Light surface on the audio tools; dark glass over the camera. */
  audioSurface: boolean
  /** Games sit at z-index 135; the bar has to clear them. */
  overLabs?: boolean
  tunerTransposition: TunerTranspositionId
  hapticFeedback: boolean
  onExpandedChange: (expanded: boolean) => void
  onDone: () => void
  onSkip: () => void
  onOpenToday: () => void
  onPause: () => void
  onReferences?: () => void
  onHistory?: () => void
  onAdjustment?: () => void
}

const POSITION_ID = 'routine-bar'
const EDGE_INSET = 12
const MIN_WIDTH = 232
const MAX_WIDTH = 560
/** Clear of the audio tools header; over the camera it can sit higher. */
const AUDIO_TOP_OFFSET = 76
const CAMERA_TOP_OFFSET = 16

function defaultWidth(): number {
  if (typeof window === 'undefined') return 384
  return Math.min(384, window.innerWidth - EDGE_INSET * 2)
}

/**
 * The routine's presence while a step is running. Collapsed it is one line —
 * step, title, clock — so the tool underneath keeps the screen. Expanded it
 * adds Done, Skip, and the way back to the board.
 *
 * It is positioned entirely by `x`/`y` motion values rather than CSS. It used
 * to centre itself with `left: 50%` plus `transform: translateX(-50%)`, but the
 * entry animation wrote its own inline transform over that, so the bar rendered
 * half a screen to the right and ran off the edge. Owning both axes in motion
 * values removes the conflict, and makes the bar draggable for free.
 */
export default function RoutineBar({
  step,
  stepIndex,
  stepCount,
  nextStep,
  startedAt,
  expanded,
  audioSurface,
  overLabs = false,
  tunerTransposition,
  hapticFeedback,
  onExpandedChange,
  onDone,
  onSkip,
  onOpenToday,
  onPause,
  onReferences,
  onHistory,
  onAdjustment,
}: RoutineBarProps) {
  const [now, setNow] = useState(() => Date.now())
  const barRef = useRef<HTMLElement | null>(null)
  const placedRef = useRef(false)
  const dragX = useMotionValue(0)
  const dragY = useMotionValue(0)
  const [width, setWidth] = useState(() => loadWidgetSize(POSITION_ID)?.width ?? defaultWidth())
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!startedAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])

  /** Restore where it was left, or spawn top-centre clear of the header. */
  useLayoutEffect(() => {
    if (placedRef.current) return
    const el = barRef.current
    const elWidth = el?.offsetWidth ?? width
    const elHeight = el?.offsetHeight ?? 64
    const saved = loadWidgetPosition(POSITION_ID)
    const start = saved
      ? clampWidgetPosition(window.innerWidth, window.innerHeight, elWidth, elHeight, saved.x, saved.y)
      : getFloatingWidgetTopCenter(
          window.innerWidth,
          window.innerHeight,
          elWidth,
          elHeight,
          audioSurface ? AUDIO_TOP_OFFSET : CAMERA_TOP_OFFSET,
        )
    dragX.set(start.x)
    dragY.set(start.y)
    placedRef.current = true
  }, [audioSurface, dragX, dragY, width])

  const reclamp = useCallback(() => {
    const el = barRef.current
    if (!el) return
    const { x, y } = clampWidgetPosition(
      window.innerWidth,
      window.innerHeight,
      el.offsetWidth,
      el.offsetHeight,
      dragX.get(),
      dragY.get(),
    )
    dragX.set(x)
    dragY.set(y)
    if (placedRef.current) saveWidgetPosition(POSITION_ID, x, y)
  }, [dragX, dragY])

  // A rotate, a keyboard, or expanding the body can leave it hanging off.
  useEffect(() => {
    window.addEventListener('resize', reclamp)
    window.addEventListener('orientationchange', reclamp)
    return () => {
      window.removeEventListener('resize', reclamp)
      window.removeEventListener('orientationchange', reclamp)
    }
  }, [reclamp])

  useEffect(() => {
    const frame = window.requestAnimationFrame(reclamp)
    return () => window.cancelAnimationFrame(frame)
  }, [expanded, reclamp])

  /** Width-only resize: the height is whatever the step needs. */
  const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = barRef.current?.offsetWidth ?? width
    const pointerId = event.pointerId
    const target = event.currentTarget
    target.setPointerCapture(pointerId)

    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      const next = Math.round(
        Math.min(
          Math.min(MAX_WIDTH, window.innerWidth - EDGE_INSET * 2),
          Math.max(MIN_WIDTH, startWidth + (moveEvent.clientX - startX)),
        ),
      )
      setWidth(next)
    }
    const end = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== pointerId) return
      target.releasePointerCapture?.(pointerId)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      const finalWidth = barRef.current?.offsetWidth ?? width
      saveWidgetSize(POSITION_ID, finalWidth, barRef.current?.offsetHeight ?? 64)
      reclamp()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  if (typeof document === 'undefined') return null

  const elapsedMs = startedAt ? now - startedAt : 0
  const targetMs = step.minutes * 60_000
  const overTarget = targetMs > 0 && elapsedMs >= targetMs
  const clock = step.minutes > 0
    ? `${formatElapsed(elapsedMs)} / ${step.minutes}:00`
    : formatElapsed(elapsedMs)
  const progress = targetMs > 0 ? Math.min(1, elapsedMs / targetMs) : 0
  const summary = summarizeStep(step, tunerTransposition)

  return createPortal(
    <motion.section
      ref={barRef}
      className={`routine-bar ${audioSurface ? 'routine-bar--audio' : ''} ${overLabs ? 'routine-bar--over-labs' : ''} ${expanded ? 'is-expanded' : ''} ${overTarget ? 'is-over' : ''} ${dragging ? 'is-dragging' : ''}`}
      aria-label="Routine step in progress"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={iosSpringSnappy}
      style={{ x: dragX, y: dragY, width }}
      drag
      dragMomentum={false}
      dragElastic={0.04}
      onDragStart={() => setDragging(true)}
      onDragEnd={() => {
        setDragging(false)
        reclamp()
      }}
    >
      <span className="routine-bar__grip" aria-hidden>
        <GripVertical />
      </span>

      <Pressable
        type="button"
        intensity="soft"
        haptic="light"
        hapticFeedback={hapticFeedback}
        className="routine-bar__line"
        onClick={() => onExpandedChange(!expanded)}
        aria-expanded={expanded}
      >
        <span className="routine-bar__step">
          {stepIndex}
          <small>/{stepCount}</small>
        </span>
        <span className="routine-bar__title">{step.title}</span>
        <span className="routine-bar__clock">{clock}</span>
        {expanded ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
      </Pressable>
      {targetMs > 0 && (
        <span className="routine-bar__track" aria-hidden>
          <i style={{ transform: `scaleX(${progress})` }} />
        </span>
      )}

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            className="routine-bar__body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
          >
            {summary && <p className="routine-bar__summary">{summary}</p>}
            {onReferences && <div className="routine-bar__resources">
              <button type="button" onClick={onReferences}>References</button>
              <button type="button" onClick={onHistory}>Progress</button>
              <button type="button" onClick={onAdjustment}>One adjustment</button>
            </div>}
            <div className="routine-bar__actions">
              <Pressable
                type="button"
                intensity="soft"
                haptic="light"
                hapticFeedback={hapticFeedback}
                onClick={onOpenToday}
              >
                <ListChecks aria-hidden />
                <span>Today</span>
              </Pressable>
              <Pressable
                type="button"
                intensity="soft"
                haptic="light"
                hapticFeedback={hapticFeedback}
                onClick={onSkip}
              >
                <SkipForward aria-hidden />
                <span>Skip</span>
              </Pressable>
              <Pressable
                type="button"
                intensity="soft"
                haptic="light"
                hapticFeedback={hapticFeedback}
                onClick={onPause}
                aria-label="Pause the routine"
              >
                <Pause aria-hidden />
                <span>Pause</span>
              </Pressable>
              <Pressable
                type="button"
                intensity="soft"
                haptic="success"
                hapticFeedback={hapticFeedback}
                className="is-primary"
                onClick={onDone}
              >
                <Check aria-hidden />
                <span>{nextStep ? 'Done & next' : 'Finish item'}</span>
              </Pressable>
            </div>
            {nextStep && (
              <p className="routine-bar__next">
                Next · {nextStep.title}
                {nextStep.minutes > 0 ? ` · ${nextStep.minutes} min` : ''}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        className="routine-bar__resize"
        aria-label="Resize the routine bar"
        onPointerDown={startResize}
      />
    </motion.section>,
    document.body,
  )
}
