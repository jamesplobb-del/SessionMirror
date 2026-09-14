import WidgetCollapseButton from './WidgetCollapseButton'
import { memo, useRef } from 'react'
import { useMotionValue } from 'framer-motion'
import { useCollapsibleWidget } from './useCollapsibleWidget'
import { useHandsFreePanelLayout } from '../hooks/useHandsFreePanelLayout'
import '../styles/hands-free-panel.css'
import { Settings2, GripHorizontal, MoveDiagonal2, Mic } from 'lucide-react'
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
  movable?: boolean
  notice?: 'sensitive' | 'microphone' | 'start' | null
  /** Seconds elapsed in the current take — shown while recording. */
  elapsed: number
  replayCountdown?: number | null
  onFinishTake?: () => void
  onNextTake?: () => void
  /** Audio mode paints a light backdrop; camera mode is dark behind the copy. */
  onLightBackground?: boolean
  placement?: HandsFreeStagePlacement
  /** Opens quiet-gap / start-level settings before recording. */
  onTapForSettings?: () => void
}

const PHASE_COPY: Record<HandsFreePhase, { title: string; detail: string }> = {
  recording: { title: 'Recording', detail: 'Pause your playing to hear this take' },
  countdown: { title: 'Ready to listen', detail: 'Keep playing to continue the take' },
  saving: { title: 'Preparing your take', detail: 'Playback starts when your take is ready' },
  playback: { title: 'Listen back', detail: 'We’ll listen for your next take afterward' },
  preparing: { title: 'Getting ready', detail: 'Give the microphone a quiet moment' },
  listening: { title: 'Your turn', detail: 'Start playing — recording begins automatically' },
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Full-screen hands-free presence layer.
 *
 * Status is transparent to workspace gestures. Only explicit settings,
 * finish, and next-take buttons intercept touches.
 */
function HandsFreeStage({
  phase,
  movable = false,
  notice = null,
  elapsed,
  replayCountdown,
  onFinishTake,
  onNextTake,
  onLightBackground = false,
  placement = 'center',
  onTapForSettings,
}: HandsFreeStageProps) {
  const panel = useHandsFreePanelLayout(movable)
  const boundaryRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const ballDetail = phase === 'recording' ? formatElapsed(elapsed)
    : phase === 'countdown' ? `${replayCountdown ?? 0}s`
    : phase === 'playback' ? 'Listen' : phase === 'saving' ? 'Saving' : phase === 'preparing' ? 'Mic…' : 'Ready'
  const fold = useCollapsibleWidget({ boundaryRef, widgetRef: panel.panelRef,
    x, y, positionId: 'hands-free-tools', label: `hands-free${phase ? `, ${PHASE_COPY[phase].title}` : ''}`,
    icon: <Mic aria-hidden />, detail: ballDetail, active: phase === 'recording',
    resetKey: `${Boolean(phase)}`, onRestore: panel.moveTo, ballSlot: 3, visible: Boolean(phase) })
  const copy = phase ? PHASE_COPY[phase] : null
  const settingsTappable = (phase === 'listening' || phase === 'preparing') && Boolean(onTapForSettings)

  return (<>
    <div ref={boundaryRef} className="hands-free-ball-layer" aria-hidden={!phase}>
      {phase && fold.ball}
    </div>
    <div
      className={`hands-free-stage ${fold.collapsed ? 'widget-is-collapsed' : ''} ${movable ? 'hands-free-stage--movable' : ''} hands-free-stage--${placement} ${
        phase ? `hands-free-stage--${phase}` : ''
      } ${
        // The chip carries its own dark backing, so the light-backdrop palette
        // would only fight it.
        onLightBackground && placement === 'center' ? 'hands-free-stage--on-light' : ''
      }`}
      role="status"
      aria-live="polite"
      aria-atomic
      aria-hidden={!phase || fold.collapsed}
      data-phase={phase ?? 'off'}
    >
      <div className="hands-free-stage__wash" aria-hidden />
      <div className="hands-free-stage__rim" aria-hidden />

      <div className="hands-free-stage__center" ref={panel.panelRef}
        style={movable ? { position: 'absolute', left: panel.layout.x, top: panel.layout.y, width: panel.layout.width } : undefined}>
        <WidgetCollapseButton label="hands-free" onCollapse={() => {
          const rect = panel.panelRef.current?.getBoundingClientRect()
          if (rect) { x.set(rect.left); y.set(rect.top) }
          fold.collapse()
        }} />
        {movable && <button type="button" className="hands-free-panel__move" aria-label="Move hands-free controls" {...panel.controls(false)}><GripHorizontal aria-hidden />Move</button>}
        <span className="hands-free-stage__pulse" aria-hidden />
        <strong className="hands-free-stage__title">{phase === 'countdown' ? `Listen back in ${replayCountdown ?? 0}s` : copy?.title ?? ''}</strong>
        <small className="hands-free-stage__detail">{copy?.detail ?? ''}</small>
        {(phase === 'recording' || phase === 'countdown') && (
          <span className="hands-free-stage__elapsed tabular-nums">
            {formatElapsed(elapsed)}
          </span>
        )}
        {(phase === 'recording' || phase === 'countdown') && onFinishTake && (
          <button type="button" className="hands-free-stage__action" onClick={onFinishTake}>Finish & listen</button>
        )}
        {phase === 'playback' && onNextTake && (
          <button type="button" className="hands-free-stage__action" onClick={onNextTake}>Next take</button>
        )}
        {notice && <div className="hands-free-panel__notice">
          <small>{notice === 'sensitive'
            ? 'Room noise or very short takes? Try a higher start level so only louder playing triggers recording.'
            : notice === 'microphone' ? 'Microphone signal interrupted. Check your audio connection before the next take.'
            : 'Recording did not start. Try again or use manual Record.'}</small>
          {notice === 'sensitive' && onTapForSettings && <button type="button" onClick={onTapForSettings}>Adjust start level</button>}
        </div>}
        {movable && <button type="button" className="hands-free-panel__resize" aria-label="Resize hands-free controls" {...panel.controls(true)}><MoveDiagonal2 aria-hidden /></button>}
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
    </div></>
  )
}

export default memo(HandsFreeStage)
