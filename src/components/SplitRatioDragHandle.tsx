import { useCallback, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { stopEventBubble } from '../utils/eventBubbling'

const MIN_RATIO = 20
const MAX_RATIO = 80
const HOLD_MS = 120
const DRAG_THRESHOLD_PX = 4

interface SplitRatioDragHandleProps {
  ratio: number
  onChange: (ratio: number) => void
  layoutRef: RefObject<HTMLElement | null>
}

function clampRatio(value: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, Math.round(value)))
}

export default function SplitRatioDragHandle({
  ratio,
  onChange,
  layoutRef,
}: SplitRatioDragHandleProps) {
  const [active, setActive] = useState(false)
  const [arming, setArming] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    startY: number
    startRatio: number
    armed: boolean
    holdTimer: number | null
  } | null>(null)

  const clearHoldTimer = useCallback(() => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.holdTimer !== null) {
      window.clearTimeout(drag.holdTimer)
      drag.holdTimer = null
    }
  }, [])

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
      onChange(clampRatio(drag.startRatio + deltaRatio))
    },
    [layoutRef, onChange],
  )

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      stopEventBubble(event)
      event.preventDefault()

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
          try {
            target.setPointerCapture(event.pointerId)
          } catch {
            /* ignore */
          }
        }, HOLD_MS),
      }

      setArming(true)
    },
    [clearHoldTimer, ratio],
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
    [applyDrag, clearHoldTimer],
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
      aria-valuemin={MIN_RATIO}
      aria-valuemax={MAX_RATIO}
      aria-label="Drag up for larger camera, drag down for larger reference"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div className="split-ratio-handle__grip" aria-hidden />
    </div>
  )
}
