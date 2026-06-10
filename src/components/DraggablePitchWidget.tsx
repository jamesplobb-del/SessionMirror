import { motion } from 'framer-motion'
import { useLayoutEffect, useRef, useState, type ComponentProps, type RefObject } from 'react'
import LivePitchTuner from './LivePitchTuner'

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
}

const VIDEO_WIDGET_WIDTH = 'min(calc(100vw - 1.5rem), 18rem)'
const VIDEO_WIDGET_HEIGHT = 188

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
  ...tunerProps
}: DraggablePitchWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null)
  const [positionY, setPositionY] = useState(() => Math.max(12, 640 - defaultBottomOffset - VIDEO_WIDGET_HEIGHT))

  useLayoutEffect(() => {
    if (isAudioMode) return

    const measurePosition = () => {
      const bounds = boundaryRef.current
      if (!bounds) return false

      const boundsHeight = bounds.clientHeight
      const widgetHeight = widgetRef.current?.offsetHeight || VIDEO_WIDGET_HEIGHT
      setPositionY(Math.max(12, boundsHeight - defaultBottomOffset - widgetHeight))
      return true
    }

    if (!measurePosition()) {
      setPositionY(Math.max(12, 320 - defaultBottomOffset - VIDEO_WIDGET_HEIGHT))
    }

    const retryFrame = window.requestAnimationFrame(() => {
      measurePosition()
    })

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            measurePosition()
          })
        : null

    if (boundaryRef.current) {
      observer?.observe(boundaryRef.current)
    }
    window.addEventListener('resize', measurePosition)

    return () => {
      window.cancelAnimationFrame(retryFrame)
      observer?.disconnect()
      window.removeEventListener('resize', measurePosition)
    }
  }, [boundaryRef, defaultBottomOffset, isAudioMode, layoutKey, mediaKey])

  const tuner = (
    <LivePitchTuner
      variant={isAudioMode ? 'audio' : 'widget'}
      mediaKey={mediaKey}
      liveMicEnabled={liveMicEnabled}
      micStreamRef={micStreamRef}
      persistWhenPaused={!isAudioMode}
      {...tunerProps}
    />
  )

  if (isAudioMode) {
    return (
      <motion.div
        key={`audio-${mediaKey}`}
        ref={widgetRef}
        className={`pitch-widget-audio pitch-widget-audio--${layoutRegion} absolute z-20 flex min-h-0 flex-col`}
        initial={{ opacity: 0, scale: 0.98, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 8 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="pitch-widget-audio__card relative flex min-h-0 flex-1 flex-col">
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
      drag
      dragMomentum={false}
      dragElastic={0.04}
      dragConstraints={boundaryRef}
      className="pitch-widget-draggable pointer-events-auto absolute left-0 top-0 z-20 touch-none"
      initial={{ opacity: 0, scale: 0.94, x: 12, y: positionY }}
      animate={{ opacity: 1, scale: 1, x: 12, y: positionY }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      style={{
        touchAction: 'none',
        width: VIDEO_WIDGET_WIDTH,
        height: VIDEO_WIDGET_HEIGHT,
        minHeight: VIDEO_WIDGET_HEIGHT,
      }}
    >
      <div
        className="relative h-full w-full overflow-hidden"
        style={{ height: VIDEO_WIDGET_HEIGHT, minHeight: VIDEO_WIDGET_HEIGHT }}
      >
        {onClose && <PitchWidgetCloseButton onClose={onClose} />}
        {tuner}
      </div>
    </motion.div>
  )
}
