import { memo } from 'react'
import { Settings2 } from 'lucide-react'
import type { HandsFreePhase } from '../utils/handsFreePhase'

/**
 * `center` is the large free-floating treatment — right when the screen behind
 * is mostly open (camera preview, tuner). `chip` is for the dense Tools tabs
 * (metronome, home) whose controls run edge to edge with no clear band to sit
 * in: there the copy takes a compact translucent backing so it stays readable
 * on top of a white tempo dial or a take card.
 */
export type HandsFreeStagePlacement = 'center' | 'chip'

interface HandsFreeStageProps {
  /** Null whenever hands-free is off or another surface owns the screen. */
  phase: HandsFreePhase | null
  /** Seconds elapsed in the current take — shown while recording. */
  elapsed: number
  /** Audio mode paints a light backdrop; camera mode is dark behind the copy. */
  onLightBackground?: boolean
  placement?: HandsFreeStagePlacement
  /**
   * Opens the quiet-gap / start-level card. Only offered while listening —
   * during recording and playback the overlay stays exactly as it was.
   */
  onTapForSettings?: () => void
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
function HandsFreeStage({
  phase,
  elapsed,
  onLightBackground = false,
  placement = 'center',
  onTapForSettings,
}: HandsFreeStageProps) {
  const copy = phase ? PHASE_COPY[phase] : null
  const settingsTappable = phase === 'listening' && Boolean(onTapForSettings)

  return (
    <div
      className={`hands-free-stage hands-free-stage--${placement} ${
        phase ? `hands-free-stage--${phase}` : ''
      } ${
        // The chip carries its own dark backing, so the light-backdrop palette
        // would only fight it.
        onLightBackground && placement === 'center' ? 'hands-free-stage--on-light' : ''
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
        {/* The centre treatment has room for the words; the compact pill on the
          * dense Tools tabs takes a glyph instead, so the status copy is never
          * squeezed on a narrow phone. Both open the same card. */}
        {settingsTappable && (
          <button
            type="button"
            className="hands-free-stage__settings"
            onClick={onTapForSettings}
            aria-label="Hands-free settings: quiet gap and start level"
          >
            {placement === 'chip' ? (
              <Settings2 aria-hidden />
            ) : (
              'Tap for settings'
            )}
          </button>
        )}
      </div>
    </div>
  )
}

export default memo(HandsFreeStage)
