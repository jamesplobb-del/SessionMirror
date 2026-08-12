import { memo } from 'react'
import type { HandsFreePhase } from '../utils/handsFreePhase'

interface HandsFreeStageProps {
  /** Null whenever hands-free is off or another surface owns the screen. */
  phase: HandsFreePhase | null
  /** Seconds elapsed in the current take — shown while recording. */
  elapsed: number
  /** Audio mode paints a light backdrop; camera mode is dark behind the copy. */
  onLightBackground?: boolean
}

const PHASE_COPY: Record<HandsFreePhase, { title: string; detail: string }> = {
  recording: { title: 'Recording', detail: 'Take in progress' },
  playback: { title: 'Playing back', detail: 'Listen, then play again' },
  preparing: { title: 'Getting ready', detail: 'Connecting microphone' },
  listening: { title: 'Listening', detail: 'Play when you’re ready' },
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Full-screen hands-free presence layer.
 *
 * Deliberately `pointer-events: none` end to end and only lightly tinted: the
 * tuner, metronome and camera behind it stay both readable and usable while
 * hands-free is running. Everything here is decoration plus a live status
 * reading — never a control.
 */
function HandsFreeStage({ phase, elapsed, onLightBackground = false }: HandsFreeStageProps) {
  const copy = phase ? PHASE_COPY[phase] : null

  return (
    <div
      className={`hands-free-stage ${phase ? `hands-free-stage--${phase}` : ''} ${
        onLightBackground ? 'hands-free-stage--on-light' : ''
      }`}
      role="status"
      aria-live="polite"
      aria-atomic
      aria-hidden={!phase}
      data-phase={phase ?? 'off'}
    >
      <div className="hands-free-stage__wash" aria-hidden />
      <div className="hands-free-stage__rim" aria-hidden />

      <div className="hands-free-stage__center">
        <span className="hands-free-stage__pulse" aria-hidden />
        <strong className="hands-free-stage__title">{copy?.title ?? ''}</strong>
        <small className="hands-free-stage__detail">{copy?.detail ?? ''}</small>
        {phase === 'recording' && (
          <span className="hands-free-stage__elapsed tabular-nums">
            {formatElapsed(elapsed)}
          </span>
        )}
      </div>
    </div>
  )
}

export default memo(HandsFreeStage)
