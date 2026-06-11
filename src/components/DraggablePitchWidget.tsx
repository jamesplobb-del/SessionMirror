import { motion, useMotionValue } from 'framer-motion'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type RefObject } from 'react'
import { usePinchResize } from '../hooks/usePinchResize'
import LivePitchTuner from './LivePitchTuner'
import { agentDebugLog } from '../utils/agentDebugLog'

type TunerProps = Omit<
  ComponentProps<typeof LivePitchTuner>,
  'variant' | 'liveMicEnabled' | 'micStreamRef'
>

interface DraggablePitchWidgetProps extends TunerProps {
  boundaryRef: RefObject<HTMLElement | null>
  defaultBottomOffset?: number
  onClose?: () => void
  isAudioMode?: boolean
  liveMicEnabled?: boolean
  micStreamRef?: RefObject<MediaStream | null>
  layoutRegion?: 'main' | 'review'
  /** Forces layout remeasure when the host surface opens or media changes. */
  layoutKey?: string
  tunerInstrument?: TunerProps['tunerInstrument']
  pitchSource?: 'media' | 'microphone'
  liveMicOnly?: boolean
}

const DEFAULT_WIDGET_SIZE = { width: 288, height: 188 }
const MIN_WIDGET_SIZE = { width: 168, height: 112 }

function PitchWidgetCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClose()
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className="pitch-widget-close absolute right-3 top-3 z-30 flex h-[26px] w-[26px] items-center justify-center rounded-full transition hover:bg-white/20 active:scale-95"
      aria-label="Hide pitch tuner"
    >
      <svg
        viewBox="0 0 12 12"
        width="10"
        height="10"
        aria-hidden
        className="text-white/90"
      >
        <path
          d="M2.5 2.5l7 7M9.5 2.5l-7 7"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  )
}

export default function DraggablePitchWidget({
  boundaryRef,
  defaultBottomOffset = 130,
  mediaKey,
  onClose,
  isAudioMode = false,
  liveMicEnabled = true,
  micStreamRef,
  layoutRegion = 'main',
  layoutKey = '',
  tunerInstrument = 'voice',
  pitchSource = 'media',
  liveMicOnly = false,
  ...tunerProps
}: DraggablePitchWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null)
  const dragX = useMotionValue(12)
  const dragY = useMotionValue(0)
  const [maxSize, setMaxSize] = useState(() => ({
    width: Math.min(360, window.innerWidth - 24),
    height: Math.min(280, Math.floor(window.innerHeight * 0.38)),
  }))

  const pinchLimits = useMemo(
    () => ({
      initial: DEFAULT_WIDGET_SIZE,
      min: MIN_WIDGET_SIZE,
      max: maxSize,
    }),
    [maxSize],
  )

  const {
    size: widgetSize,
    pinching,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  } = usePinchResize(pinchLimits)

  useEffect(() => {
    // #region agent log
    agentDebugLog(
      'DraggablePitchWidget.tsx:mount',
      'pitch widget mounted',
      { isAudioMode, mediaKey, liveMicOnly, layoutRegion },
      'H7',
    )
    // #endregion
  }, [isAudioMode, layoutRegion, liveMicOnly, mediaKey])

  useLayoutEffect(() => {
    const measureMax = () => {
      setMaxSize({
        width: Math.min(360, window.innerWidth - 24),
        height: Math.min(280, Math.floor(window.innerHeight * 0.38)),
      })
    }

    measureMax()
    window.addEventListener('resize', measureMax)
    return () => window.removeEventListener('resize', measureMax)
  }, [layoutKey])

  useLayoutEffect(() => {
    if (isAudioMode) return

    const measureInitialPosition = () => {
      const bounds = boundaryRef.current
      if (!bounds) return false

      const boundsHeight = bounds.clientHeight
      const widgetHeight = DEFAULT_WIDGET_SIZE.height
      dragX.set(12)
      dragY.set(Math.max(12, boundsHeight - defaultBottomOffset - widgetHeight))
      return true
    }

    if (!measureInitialPosition()) {
      dragX.set(12)
      dragY.set(Math.max(12, 320 - defaultBottomOffset - DEFAULT_WIDGET_SIZE.height))
    }

    const retryFrame = window.requestAnimationFrame(() => {
      measureInitialPosition()
    })

    return () => {
      window.cancelAnimationFrame(retryFrame)
    }
  }, [boundaryRef, defaultBottomOffset, dragX, dragY, isAudioMode, layoutKey, mediaKey])

  const tuner = (
    <LivePitchTuner
      variant={isAudioMode ? 'audio' : 'widget'}
      mediaKey={mediaKey}
      liveMicEnabled={liveMicEnabled}
      micStreamRef={micStreamRef}
      tunerInstrument={tunerInstrument}
      persistWhenPaused={!isAudioMode}
      pitchSource={isAudioMode ? 'media' : pitchSource}
      liveMicOnly={liveMicOnly}
      {...tunerProps}
    />
  )

  if (isAudioMode) {
    return (
      <motion.div
        key={`audio-${mediaKey}`}
        ref={widgetRef}
        className={`pitch-widget-audio pitch-widget-audio--${layoutRegion} pitch-widget-audio--stage absolute z-[5] flex min-h-0 flex-col`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="pitch-widget-audio__stage relative flex min-h-0 max-h-full w-full flex-col">
          {onClose && <PitchWidgetCloseButton onClose={onClose} />}
          {tuner}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      key={mediaKey}
      ref={widgetRef}
      drag={!pinching}
      dragMomentum={false}
      dragElastic={0.04}
      dragConstraints={boundaryRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={`pitch-widget-draggable pointer-events-auto absolute left-0 top-0 z-20 touch-none ${pinching ? 'pitch-widget-draggable--pinching' : ''}`}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      style={{
        x: dragX,
        y: dragY,
        touchAction: 'none',
        width: widgetSize.width,
        height: widgetSize.height,
        minHeight: widgetSize.height,
      }}
    >
      <div className="ui-orient-spin relative h-full min-h-0 w-full overflow-hidden">
        {onClose && <PitchWidgetCloseButton onClose={onClose} />}
        {tuner}
      </div>
    </motion.div>
  )
}
