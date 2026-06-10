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
}

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
  ...tunerProps
}: DraggablePitchWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null)
  const [initialY, setInitialY] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (isAudioMode) return

    const updatePosition = () => {
      const bounds = boundaryRef.current
      const widget = widgetRef.current
      if (!bounds) return

      const boundsHeight = bounds.clientHeight
      const widgetHeight = widget?.offsetHeight || 180

      setInitialY(Math.max(12, boundsHeight - defaultBottomOffset - widgetHeight))
    }

    updatePosition()

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updatePosition)
        : null

    if (boundaryRef.current) {
      observer?.observe(boundaryRef.current)
    }
    window.addEventListener('resize', updatePosition)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updatePosition)
    }
  }, [boundaryRef, defaultBottomOffset, isAudioMode, mediaKey])

  const tuner = (
    <LivePitchTuner
      variant={isAudioMode ? 'audio' : 'widget'}
      mediaKey={mediaKey}
      liveMicEnabled={liveMicEnabled}
      micStreamRef={micStreamRef}
      {...tunerProps}
    />
  )

  if (isAudioMode) {
    return (
      <motion.div
        key={`audio-${mediaKey}`}
        ref={widgetRef}
        className={`pitch-widget-audio pitch-widget-audio--${layoutRegion} pointer-events-auto absolute z-20 flex min-h-0 w-auto flex-col`}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.22, ease: 'easeInOut' }}
        style={{ width: '100%' }}
      >
        <div className="relative flex h-full min-h-0 w-full flex-1 flex-col">
          {onClose && <PitchWidgetCloseButton onClose={onClose} />}
          {tuner}
        </div>
      </motion.div>
    )
  }

  if (initialY === null) {
    return (
      <div
        ref={widgetRef}
        className="pitch-widget-draggable pointer-events-none absolute left-3 top-0 z-20 w-[min(calc(100%-1.5rem),18rem)] min-h-[180px] opacity-0"
        style={{ width: '100%', maxWidth: 'min(calc(100% - 1.5rem), 18rem)' }}
        aria-hidden
      >
        {tuner}
      </div>
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
      className="pitch-widget-draggable pointer-events-auto absolute left-0 top-0 z-20 w-[min(calc(100%-1.5rem),18rem)] min-h-[180px] touch-none"
      initial={{ opacity: 0, scale: 0.94, x: 12, y: initialY }}
      animate={{ opacity: 1, scale: 1, x: 12, y: initialY }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      style={{ touchAction: 'none', width: '100%', maxWidth: 'min(calc(100% - 1.5rem), 18rem)' }}
    >
      <div className="relative h-full min-h-[180px] w-full">
        {onClose && <PitchWidgetCloseButton onClose={onClose} />}
        {tuner}
      </div>
    </motion.div>
  )
}
