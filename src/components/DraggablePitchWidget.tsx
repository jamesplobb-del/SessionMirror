import { motion } from 'framer-motion'
import { useLayoutEffect, useRef, useState, type ComponentProps, type RefObject } from 'react'
import LivePitchTuner from './LivePitchTuner'

type TunerProps = Omit<ComponentProps<typeof LivePitchTuner>, 'variant'>

interface DraggablePitchWidgetProps extends TunerProps {
  boundaryRef: RefObject<HTMLElement | null>
  defaultBottomOffset?: number
}

export default function DraggablePitchWidget({
  boundaryRef,
  defaultBottomOffset = 130,
  mediaKey,
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
      initial={{ x: 12, y: initialY }}
      style={{ touchAction: 'none' }}
    >
      <LivePitchTuner variant="widget" mediaKey={mediaKey} {...tunerProps} />
    </motion.div>
  )
}
