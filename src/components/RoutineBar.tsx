import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, ChevronUp, ListChecks, Pause, SkipForward } from 'lucide-react'
import Pressable from './ui/Pressable'
import { iosSpringSnappy, motionGpuLayer } from '../utils/motionPresets'
import type { TunerTranspositionId } from '../utils/tunerTransposition'
import { formatElapsed, summarizeStep, type RoutineStep } from '../utils/practiceRoutines'

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

/**
 * The routine's presence while a step is running. Collapsed it is one line —
 * step, title, clock — so the tool underneath keeps the screen. Expanded it
 * adds Done, Skip, and the way back to the board.
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

  useEffect(() => {
    if (!startedAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])

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
      className={`routine-bar ${audioSurface ? 'routine-bar--audio' : ''} ${overLabs ? 'routine-bar--over-labs' : ''} ${expanded ? 'is-expanded' : ''} ${overTarget ? 'is-over' : ''}`}
      aria-label="Routine step in progress"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={iosSpringSnappy}
      style={motionGpuLayer}
    >
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
    </motion.section>,
    document.body,
  )
}
