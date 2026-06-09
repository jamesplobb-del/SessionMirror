import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from 'react'

const LONG_PRESS_MS = 280
const DRAG_THRESHOLD_PX = 8
const MOVEMENT_CANCEL_PX = 12

function pointInRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

export interface DragGhostState {
  x: number
  y: number
  overTarget: boolean
}

interface UseDragToPinOptions {
  sourceTakeId: string | null
  dropTargetRef: RefObject<HTMLElement | null>
  onPin: (takeId: string) => void
  onTap?: () => void
  enabled: boolean
  hapticFeedback?: boolean
}

export function useDragToPin({
  sourceTakeId,
  dropTargetRef,
  onPin,
  onTap,
  enabled,
  hapticFeedback = true,
}: UseDragToPinOptions) {
  const draggingRef = useRef(false)
  const armedRef = useRef(false)
  const startRef = useRef({ x: 0, y: 0 })
  const pointerIdRef = useRef<number | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const [ghost, setGhost] = useState<DragGhostState | null>(null)
  const [isArming, setIsArming] = useState(false)

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    clearLongPressTimer()
    draggingRef.current = false
    armedRef.current = false
    pointerIdRef.current = null
    setIsArming(false)
    setGhost(null)
  }, [clearLongPressTimer])

  useEffect(() => {
    if (!isArming && !ghost) return

    document.body.classList.add('pip-drag-active')
    return () => {
      document.body.classList.remove('pip-drag-active')
    }
  }, [ghost, isArming])

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!enabled || !sourceTakeId) return
      if ((event.target as HTMLElement).closest('button, label, input')) return

      clearLongPressTimer()
      startRef.current = { x: event.clientX, y: event.clientY }
      pointerIdRef.current = event.pointerId
      draggingRef.current = false
      armedRef.current = false
      setIsArming(false)

      event.currentTarget.setPointerCapture(event.pointerId)

      longPressTimerRef.current = window.setTimeout(() => {
        armedRef.current = true
        setIsArming(true)
        if (hapticFeedback && navigator.vibrate) {
          navigator.vibrate(12)
        }
      }, LONG_PRESS_MS)
    },
    [clearLongPressTimer, enabled, hapticFeedback, sourceTakeId],
  )

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (pointerIdRef.current !== event.pointerId) return

      const deltaX = event.clientX - startRef.current.x
      const deltaY = event.clientY - startRef.current.y
      const distance = Math.hypot(deltaX, deltaY)

      if (!armedRef.current && !draggingRef.current) {
        if (distance > MOVEMENT_CANCEL_PX) {
          clearLongPressTimer()
        }
        return
      }

      if (armedRef.current && !draggingRef.current) {
        if (distance < DRAG_THRESHOLD_PX) return

        draggingRef.current = true
        setIsArming(false)
        event.preventDefault()
      }

      if (!draggingRef.current) return

      event.preventDefault()

      const rect = dropTargetRef.current?.getBoundingClientRect()
      const overTarget = rect
        ? pointInRect(event.clientX, event.clientY, rect)
        : false

      setGhost({
        x: event.clientX,
        y: event.clientY,
        overTarget,
      })
    },
    [clearLongPressTimer, dropTargetRef],
  )

  const handlePointerEnd = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (pointerIdRef.current !== event.pointerId) return

      clearLongPressTimer()

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }

      const deltaX = event.clientX - startRef.current.x
      const deltaY = event.clientY - startRef.current.y
      const distance = Math.hypot(deltaX, deltaY)

      if (draggingRef.current && sourceTakeId) {
        const rect = dropTargetRef.current?.getBoundingClientRect()
        const overTarget = rect
          ? pointInRect(event.clientX, event.clientY, rect)
          : false
        if (overTarget) {
          onPin(sourceTakeId)
        }
      } else if (
        !armedRef.current &&
        !draggingRef.current &&
        distance < DRAG_THRESHOLD_PX
      ) {
        onTap?.()
      }

      reset()
    },
    [clearLongPressTimer, dropTargetRef, onPin, onTap, reset, sourceTakeId],
  )

  return {
    ghost,
    isDragging: ghost !== null,
    isArming,
    dragSourceProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerEnd,
      onPointerCancel: handlePointerEnd,
    },
  }
}
