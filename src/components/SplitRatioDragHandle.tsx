import { useCallback, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { stopEventBubble } from '../utils/eventBubbling'
import { triggerDragStartHaptic, triggerLightHaptic } from '../utils/haptics'

const DEFAULT_MIN_RATIO = 20
const DEFAULT_MAX_RATIO = 80
const HOLD_MS = 120
const DRAG_THRESHOLD_PX = 4

interface SplitRatioDragHandleProps {
  ratio: number
  onChange: (ratio: number) => void
  layoutRef: RefObject<HTMLElement | null>
  hapticFeedback?: boolean
  minRatio?: number
  maxRatio?: number
  ariaLabel?: string
}

function clampRatio(value: number, minRatio: number, maxRatio: number): number {
  return Math.min(maxRatio, Math.max(minRatio, Math.round(value)))
}

export default function SplitRatioDragHandle({
  ratio,
  onChange,
  layoutRef,
  hapticFeedback = true,
  minRatio = DEFAULT_MIN_RATIO,
  maxRatio = DEFAULT_MAX_RATIO,
  ariaLabel = 'Drag up for larger camera, drag down for larger reference',
}: SplitRatioDragHandleProps) {
  const [active, setActive] = useState(false)
  const [arming, setArming] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    startY: number
    startRatio: number
    armed: boolean
    holdTimer: number | null
    dragHapticFired: boolean
  } | null>(null)

  const clearHoldTimer = useCallback(() => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.holdTimer !== null) {
      window.clearTimeout(drag.holdTimer)
      drag.holdTimer = null
    }
  }, [])

  const fireDragHaptic = useCallback(() => {
    const drag = dragRef.current
    if (!drag || drag.dragHapticFired || !hapticFeedback) return
    drag.dragHapticFired = true
    void triggerDragStartHaptic()
  }, [hapticFeedback])

  const finishDrag = useCallback(
    (target: HTMLElement, pointerId: number) => {
      clearHoldTimer()
      dragRef.current = null
      setActive(false)
      setArming(false)
      try {
        if (target.hasPointerCapture(pointerId)) {
          target.releasePointerCapture(pointerId)
        }
      } catch {
        /* ignore */
      }
    },
    [clearHoldTimer],
  )

  const applyDrag = useCallback(
    (clientY: number) => {
      const drag = dragRef.current
      const layout = layoutRef.current
      if (!drag?.armed || !layout) return

      const rect = layout.getBoundingClientRect()
      if (rect.height <= 0) return

      const deltaRatio = ((clientY - drag.startY) / rect.height) * 100
      onChange(clampRatio(drag.startRatio + deltaRatio, minRatio, maxRatio))
    },
    [layoutRef, maxRatio, minRatio, onChange],
  )

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      stopEventBubble(event)
      event.preventDefault()

      triggerLightHaptic(hapticFeedback)

      const target = event.currentTarget
      clearHoldTimer()

      dragRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startRatio: ratio,
        armed: false,
        holdTimer: window.setTimeout(() => {
          const drag = dragRef.current
          if (!drag) return
          drag.armed = true
          drag.holdTimer = null
          setArming(false)
          setActive(true)
          fireDragHaptic()
          try {
            target.setPointerCapture(event.pointerId)
          } catch {
            /* ignore */
          }
        }, HOLD_MS),
        dragHapticFired: false,
      }

      setArming(true)
    },
    [clearHoldTimer, fireDragHaptic, hapticFeedback, ratio],
  )

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return

      if (!drag.armed) {
        const moved = Math.abs(event.clientY - drag.startY)
        if (moved < DRAG_THRESHOLD_PX) return

        clearHoldTimer()
        drag.armed = true
        setArming(false)
        setActive(true)
        fireDragHaptic()
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          /* ignore */
        }
      }

      stopEventBubble(event)
      event.preventDefault()
      applyDrag(event.clientY)
    },
    [applyDrag, clearHoldTimer, fireDragHaptic],
  )

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return
      finishDrag(event.currentTarget, event.pointerId)
    },
    [finishDrag],
  )

  const handlePointerCancel = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return
      finishDrag(event.currentTarget, event.pointerId)
    },
    [finishDrag],
  )

  return (
    <div
      className={`split-ratio-handle pointer-events-auto shrink-0 touch-none select-none ${
        active ? 'split-ratio-handle--active' : ''
      } ${arming ? 'split-ratio-handle--arming' : ''}`}
      role="separator"
      aria-orientation="horizontal"
      aria-valuenow={ratio}
      aria-valuemin={minRatio}
      aria-valuemax={maxRatio}
      aria-label={ariaLabel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div className="split-ratio-handle__grip" aria-hidden>
        <ChevronsUpDown className="h-4 w-4 stroke-[1.75]" />
      </div>
    </div>
  )
}
