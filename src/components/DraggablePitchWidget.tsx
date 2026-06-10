import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ComponentProps, type RefObject } from 'react'
import LivePitchTuner from './LivePitchTuner'

type TunerProps = Omit<ComponentProps<typeof LivePitchTuner>, 'variant'>

interface DraggablePitchWidgetProps extends TunerProps {
  boundaryRef: RefObject<HTMLElement | null>
  defaultBottomOffset?: number
  onClose?: () => void
}

export default function DraggablePitchWidget({
  boundaryRef,
  defaultBottomOffset = 130,
  mediaKey,
  onClose,
  ...tunerProps
}: DraggablePitchWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null)
  const [initialY, setInitialY] = useState<number | null>(null)

  useLayoutEffect(() => {
    const updatePosition = () => {
      const bounds = boundaryRef.current
      const widget = widgetRef.current
      if (!bounds) return

      const boundsHeight = bounds.clientHeight
      const widgetHeight = widget?.offsetHeight || 112

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
  }, [boundaryRef, defaultBottomOffset, mediaKey])

  if (initialY === null) {
    return (
      <div
        ref={widgetRef}
        className="pitch-widget-draggable pointer-events-none absolute left-3 top-0 z-20 w-[min(calc(100%-1.5rem),18rem)] opacity-0"
        aria-hidden
      >
        <LivePitchTuner variant="widget" mediaKey={mediaKey} {...tunerProps} />
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
      className="pitch-widget-draggable pointer-events-auto absolute left-0 top-0 z-20 w-[min(calc(100%-1.5rem),18rem)] touch-none"
      initial={{ opacity: 0, scale: 0.94, x: 12, y: initialY }}
      animate={{ opacity: 1, scale: 1, x: 12, y: initialY }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      style={{ touchAction: 'none' }}
    >
      <div className="relative">
        {onClose && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onClose()
            }}
            onPointerDown={(event) => event.stopPropagation()}
            className="absolute right-1.5 top-1.5 z-30 flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/75 backdrop-blur-sm transition hover:bg-black/50 hover:text-white"
            aria-label="Hide pitch tuner"
          >
            <X className="h-3 w-3" strokeWidth={2.25} />
          </button>
        )}
        <LivePitchTuner variant="widget" mediaKey={mediaKey} {...tunerProps} />
      </div>
    </motion.div>
  )
}
