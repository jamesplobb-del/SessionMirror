import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Pause, Play, Check } from 'lucide-react'
import { formatElapsed, type RoutineStep } from '../utils/practiceRoutines'

interface RoutineBarProps {
  goalMs?: number
  step: RoutineStep
  /** 1-based. */
  stepIndex: number
  stepCount: number
  nextStep: RoutineStep | null
  elapsedMs?: number
  busy?: boolean
  startedAt: number | null
  paused: boolean
  audioSurface: boolean
  overLabs?: boolean
  onResume: () => void
  onPause: () => void
  onDone: () => void
  onOpenToday: () => void
}

export default function RoutineBar({ goalMs, step, stepIndex, stepCount, nextStep,
  startedAt, elapsedMs = 0, paused = false, busy = false, audioSurface, overLabs,
  onPause, onResume, onDone, onOpenToday }: RoutineBarProps) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    setNow(Date.now())
    if (!startedAt || paused) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt, paused])
  const elapsed = elapsedMs + (!paused && startedAt ? Math.max(0, now - startedAt) : 0)
  return createPortal(
    <motion.section className={`routine-bar routine-bar--simple ${audioSurface ? 'routine-bar--audio' : ''} ${overLabs ? 'routine-bar--over-labs' : ''}`}
      aria-label={paused ? 'Routine paused' : 'Routine in progress'}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <button type="button" className="routine-bar__line" onClick={onOpenToday} disabled={busy} aria-label={`Open routine: ${step.title}`}>
        <span className="routine-bar__step">{stepIndex}<small>/{stepCount}</small></span>
        <span className="routine-bar__title">{step.title}</span>
        <span className="routine-bar__clock">{paused ? 'Paused' : goalMs ? `${formatElapsed(elapsed)} / ${formatElapsed(goalMs)}` : formatElapsed(elapsed)}</span>
      </button>
      <div className="routine-bar__actions">
        <button type="button" disabled={busy} onClick={paused ? onResume : onPause} aria-label={paused ? 'Resume routine' : 'Pause routine'}>
          {paused ? <Play aria-hidden /> : <Pause aria-hidden />}<span>{paused ? 'Play' : 'Pause'}</span>
        </button>
        <button type="button" className="is-primary" disabled={busy} onClick={onDone}>
          <Check aria-hidden /><span>{busy ? 'Saving…' : nextStep ? 'Done & next' : 'Finish routine'}</span>
        </button>
      </div>
    </motion.section>, document.body,
  )
}
