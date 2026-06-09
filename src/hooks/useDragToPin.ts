import { useCallback, useRef, useState, type PointerEvent, type RefObject } from 'react'

const DRAG_THRESHOLD_PX = 10

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
}

export function useDragToPin({
  sourceTakeId,
  dropTargetRef,
  onPin,
  onTap,
  enabled,
}: UseDragToPinOptions) {
  const draggingRef = useRef(false)
  const startRef = useRef({ x: 0, y: 0 })
  const pointerIdRef = useRef<number | null>(null)
  const [ghost, setGhost] = useState<DragGhostState | null>(null)

  const reset = useCallback(() => {
    draggingRef.current = false
    pointerIdRef.current = null
    setGhost(null)
  }, [])

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!enabled || !sourceTakeId) return
      if ((event.target as HTMLElement).closest('button, label, input')) return

      startRef.current = { x: event.clientX, y: event.clientY }
      pointerIdRef.current = event.pointerId
      draggingRef.current = false
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [enabled, sourceTakeId],
  )

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (pointerIdRef.current !== event.pointerId) return

      const deltaX = event.clientX - startRef.current.x
      const deltaY = event.clientY - startRef.current.y
      const distance = Math.hypot(deltaX, deltaY)

      if (!draggingRef.current && distance >= DRAG_THRESHOLD_PX) {
        draggingRef.current = true
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
    [dropTargetRef],
  )

  const handlePointerEnd = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (pointerIdRef.current !== event.pointerId) return

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
      } else if (distance < DRAG_THRESHOLD_PX) {
        onTap?.()
      }

      reset()
    },
    [dropTargetRef, onPin, onTap, reset, sourceTakeId],
  )

  return {
    ghost,
    isDragging: ghost !== null,
    dragSourceProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerEnd,
      onPointerCancel: handlePointerEnd,
    },
  }
}
