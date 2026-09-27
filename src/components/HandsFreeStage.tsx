import WidgetCollapseButton from './WidgetCollapseButton'
import { PremiumActivity } from './ui/PremiumRecordingFeedback'
import PremiumReveal from './ui/PremiumReveal'
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useMotionValue } from 'framer-motion'
import { useCollapsibleWidget } from './useCollapsibleWidget'
import { useHandsFreePanelLayout } from '../hooks/useHandsFreePanelLayout'
import '../styles/hands-free-panel.css'
import { Settings2 } from 'lucide-react'
import { HandsFreeToolIcon } from './icons/toolIcons'
import HandsFreeSettingsRows from './HandsFreeSettingsRows'
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
  dockRight?: boolean
  collapseResetKey?: string
  notice?: 'sensitive' | 'microphone' | 'start' | null
  /** Seconds elapsed in the current take — shown while recording. */
  elapsed: number
  replayCountdown?: number | null
  onFinishTake?: () => void
  onNextTake?: () => void
  /** Audio mode paints a light backdrop; camera mode is dark behind the copy. */
  onLightBackground?: boolean
  placement?: HandsFreeStagePlacement
  /** Settings opened inside the widget — also an explicit mic-recovery gesture. */
  onTapForSettings?: () => void
  /** Seconds of quiet before a take stops. */
  silenceSeconds: number
  /** Start level 1–100. */
  volumeThreshold: number
  hapticFeedback?: boolean
  onSilenceSecondsChange: (seconds: number) => void
  onVolumeThresholdChange: (threshold: number) => void
  /** Turns hands-free off — same as closing any other widget with its ×. */
  onClose?: () => void
}

const PHASE_COPY: Record<HandsFreePhase, { title: string; detail: string }> = {
  recording: { title: 'Recording', detail: 'Pause your playing to hear this take' },
  countdown: { title: 'Ready to listen', detail: 'Keep playing to continue the take' },
  saving: { title: 'Preparing take', detail: 'Playback will start automatically' },
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
  dockRight = false,
  collapseResetKey,
  notice = null,
  elapsed,
  replayCountdown,
  onFinishTake,
  onNextTake,
  onLightBackground = false,
  placement = 'center',
  onTapForSettings,
  silenceSeconds,
  volumeThreshold,
  hapticFeedback,
  onSilenceSecondsChange,
  onVolumeThresholdChange,
  onClose,
}: HandsFreeStageProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Settings close with the widget: turning hands-free back on starts clean.
  useEffect(() => { if (!phase) setSettingsOpen(false) }, [phase])
  const openSettings = () => {
    if (!settingsOpen) onTapForSettings?.()
    setSettingsOpen(open => !open)
  }
  // The rows make the panel taller. Lift it so they never land on Record.
  useLayoutEffect(() => {
    if (!settingsOpen || !movable) return
    const panelEl = panel.panelRef.current
    const dock = document.querySelector('.open-lens-dock, [data-tutorial="record-controls"]')
    if (!panelEl || !dock) return
    const overlap = panelEl.getBoundingClientRect().bottom - (dock.getBoundingClientRect().top - 8)
    if (overlap > 0) panel.moveTo({ x: panel.layout.x, y: Math.max(12, panel.layout.y - overlap) })
    // Only the moment settings open; after that the player owns the position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen])
  const panel = useHandsFreePanelLayout(movable)
  const boundaryRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const ballDetail = phase === 'recording' ? formatElapsed(elapsed)
    : phase === 'countdown' ? `${replayCountdown ?? 0}s`
    : phase === 'playback' ? 'Listen' : phase === 'saving' ? 'Saving' : phase === 'preparing' ? 'Mic…' : 'Ready'
  const settingsTappable = Boolean(phase)
  const fold = useCollapsibleWidget({ boundaryRef, widgetRef: panel.panelRef,
    x, y, positionId: 'hands-free-tools', label: `hands-free${phase ? `, ${PHASE_COPY[phase].title}` : ''}`,
    icon: <HandsFreeToolIcon aria-hidden />, detail: ballDetail, active: phase === 'recording',
    resetKey: `${Boolean(phase)}:${collapseResetKey ?? ''}`, onRestore: panel.moveTo, ballSlot: 3, visible: Boolean(phase), dockRight })
  const copy = phase ? PHASE_COPY[phase] : null

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
        {onClose && (
          <button
            type="button"
            data-no-drag
            className={`pitch-widget-close hands-free-stage__close ${
              onLightBackground ? 'pitch-widget-close--elevated' : ''
            }`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onClose()
            }}
            aria-label="Turn off hands-free"
          >
            <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
              <path
                d="M2.5 2.5l7 7M9.5 2.5l-7 7"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
        {movable && <button type="button" className="hands-free-panel__move" aria-label="Move hands-free controls" {...panel.controls(false)}><span aria-hidden /></button>}
        {phase === 'saving' || phase === 'preparing' ? <PremiumActivity /> : <span className="hands-free-stage__pulse" aria-hidden />}
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
            ? 'The start level may be too sensitive: background sound or repeated short takes were detected. Raise the start level to trigger only when you play.'
            : notice === 'microphone' ? 'Microphone signal interrupted. Reconnecting automatically… Check your audio connection if this continues.'
            : 'Recording did not start. Rearming automatically for your next take.'}</small>
          {notice === 'sensitive' && !settingsOpen && <button type="button" onClick={openSettings}>Adjust start level</button>}
        </div>}
        {settingsTappable && (
          <button
            type="button"
            className="hands-free-stage__settings"
            onClick={openSettings}
            aria-expanded={settingsOpen}
            aria-label={settingsOpen ? 'Hide hands-free settings' : 'Hands-free settings: quiet gap and start level'}
          >
            <Settings2 aria-hidden />
            <span>{settingsOpen ? 'Done' : 'Settings'}</span>
          </button>
        )}
        <PremiumReveal open={settingsTappable && settingsOpen}>
          <HandsFreeSettingsRows
            silenceSeconds={silenceSeconds}
            volumeThreshold={volumeThreshold}
            hapticFeedback={hapticFeedback}
            onSilenceSecondsChange={onSilenceSecondsChange}
            onVolumeThresholdChange={onVolumeThresholdChange}
          />
        </PremiumReveal>
      </div>
    </div></>
  )
}

export default memo(HandsFreeStage)
