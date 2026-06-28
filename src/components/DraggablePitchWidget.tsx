import { motion, useMotionValue } from 'framer-motion'
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type RefObject } from 'react'
import { usePinchResize } from '../hooks/usePinchResize'
import LivePitchTuner from './LivePitchTuner'
import { getFloatingWidgetTopCenter, loadWidgetPosition, saveWidgetPosition } from '../utils/floatingWidgetLayout'

type TunerProps = Omit<
  ComponentProps<typeof LivePitchTuner>,
  'variant' | 'liveMicEnabled' | 'micStreamRef'
>

interface DraggablePitchWidgetProps extends TunerProps {
  boundaryRef: RefObject<HTMLElement | null>
  onClose?: () => void
  isAudioMode?: boolean
  liveMicEnabled?: boolean
  micStreamRef?: RefObject<MediaStream | null>
  layoutRegion?: 'main' | 'review'
  /** Stable id for persisting drag position across modal open/close. */
  positionId?: string
  tunerInstrument?: TunerProps['tunerInstrument']
  pitchSource?: 'media' | 'microphone'
  liveMicOnly?: boolean
}

const DEFAULT_WIDGET_SIZE = { width: 288, height: 220 }
const MIN_WIDGET_SIZE = { width: 168, height: 148 }

function PitchWidgetCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClose()
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className="pitch-widget-close pitch-widget-close--elevated absolute right-3 top-3 z-30 flex h-[26px] w-[26px] items-center justify-center rounded-full transition active:scale-95"
      aria-label="Hide pitch tuner"
    >
      <svg
        viewBox="0 0 12 12"
        width="10"
        height="10"
        aria-hidden
        className="text-[var(--audio-text-secondary,#6c7077)]"
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
  mediaKey,
  onClose,
  isAudioMode = false,
  liveMicEnabled = true,
  micStreamRef,
  layoutRegion = 'main',
  positionId,
  tunerInstrument = 'voice',
  pitchSource = 'media',
  liveMicOnly = false,
  ...tunerProps
}: DraggablePitchWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null)
  const dragX = useMotionValue(0)
  const dragY = useMotionValue(0)
  const positionReadyRef = useRef(false)
  const resolvedPositionId = positionId ?? `pitch-${layoutRegion}`
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
  }, [])

  useLayoutEffect(() => {
    if (isAudioMode || positionReadyRef.current) return

    const applyPosition = () => {
      const bounds = boundaryRef.current
      if (!bounds) return false

      const saved = loadWidgetPosition(resolvedPositionId)
      if (saved) {
        dragX.set(saved.x)
        dragY.set(saved.y)
      } else {
        const width = widgetRef.current?.offsetWidth ?? DEFAULT_WIDGET_SIZE.width
        const height = widgetRef.current?.offsetHeight ?? DEFAULT_WIDGET_SIZE.height
        const { x, y } = getFloatingWidgetTopCenter(
          bounds.clientWidth,
          bounds.clientHeight,
          width,
          height,
        )
        dragX.set(x)
        dragY.set(y)
      }

      positionReadyRef.current = true
      return true
    }

    if (!applyPosition()) {
      const saved = loadWidgetPosition(resolvedPositionId)
      if (saved) {
        dragX.set(saved.x)
        dragY.set(saved.y)
        positionReadyRef.current = true
      }
    }

    const retryFrame = window.requestAnimationFrame(() => {
      if (!positionReadyRef.current) {
        applyPosition()
      }
    })

    return () => window.cancelAnimationFrame(retryFrame)
  }, [boundaryRef, dragX, dragY, isAudioMode, resolvedPositionId])

  const persistPosition = useCallback(() => {
    if (isAudioMode) return
    saveWidgetPosition(resolvedPositionId, dragX.get(), dragY.get())
  }, [dragX, dragY, isAudioMode, resolvedPositionId])

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
        className={`pitch-widget-audio pitch-widget-audio--${layoutRegion} pitch-widget-audio--stage pointer-events-none absolute z-[5] flex min-h-0 flex-col`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="pitch-widget-audio__stage relative flex min-h-0 max-h-full w-full flex-col">
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
      onDragEnd={persistPosition}
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
      <div className="ui-orient-spin relative h-full min-h-0 w-full overflow-hidden rounded-3xl">
        {onClose && <PitchWidgetCloseButton onClose={onClose} />}
        {tuner}
      </div>
    </motion.div>
  )
}
