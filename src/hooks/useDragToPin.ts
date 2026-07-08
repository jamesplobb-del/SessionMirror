import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { triggerDragStartHaptic, triggerLightHaptic, triggerSelectionHaptic } from '../utils/haptics'

const LONG_PRESS_MS = 200
const DRAG_THRESHOLD_PX = 8
const MOVEMENT_CANCEL_PX = 12

function pointInRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

export interface DragGhostState {
  x: number
  y: number
  overPin: boolean
  overDelete: boolean
}

export interface PipDragUiState {
  isDragging: boolean
  isArming: boolean
  overDelete: boolean
}

interface UseDragToPinOptions {
  sourceTakeId: string | null
  dropTargetRef: RefObject<HTMLElement | null>
  deleteDropTargetRef?: RefObject<HTMLElement | null>
  onPin: (takeId: string) => void
  onDelete?: (takeId: string) => void
  onTap?: () => void
  onDragStateChange?: (state: PipDragUiState) => void
  enabled: boolean
  hapticFeedback?: boolean
}

export function useDragToPin({
  sourceTakeId,
  dropTargetRef,
  deleteDropTargetRef,
  onPin,
  onDelete,
  onTap,
  onDragStateChange,
  enabled,
  hapticFeedback = true,
}: UseDragToPinOptions) {
  const draggingRef = useRef(false)
  const armedRef = useRef(false)
  const startRef = useRef({ x: 0, y: 0 })
  const pointerIdRef = useRef<number | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const ghostFrameRef = useRef<number | null>(null)
  const pendingGhostRef = useRef<DragGhostState | null>(null)
  const [ghost, setGhost] = useState<DragGhostState | null>(null)
  const [isArming, setIsArming] = useState(false)
  const onDragStateChangeRef = useRef(onDragStateChange)
  onDragStateChangeRef.current = onDragStateChange

  const lastEmittedRef = useRef<PipDragUiState>({
    isDragging: false,
    isArming: false,
    overDelete: false,
  })

  const emitDragState = useCallback(
    (isDragging: boolean, isArmingState: boolean, overDelete: boolean) => {
      const next = {
        isDragging,
        isArming: isArmingState,
        overDelete,
      }
      const prev = lastEmittedRef.current
      if (
        prev.isDragging === next.isDragging &&
        prev.isArming === next.isArming &&
        prev.overDelete === next.overDelete
      ) {
        return
      }
      lastEmittedRef.current = next
      onDragStateChangeRef.current?.(next)
    },
    [],
  )

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const flushGhost = useCallback(() => {
    ghostFrameRef.current = null
    if (pendingGhostRef.current) {
      setGhost(pendingGhostRef.current)
    }
  }, [])

  const scheduleGhost = useCallback(
    (next: DragGhostState) => {
      pendingGhostRef.current = next
      if (ghostFrameRef.current !== null) return
      ghostFrameRef.current = window.requestAnimationFrame(flushGhost)
    },
    [flushGhost],
  )

  const reset = useCallback(() => {
    clearLongPressTimer()
    if (ghostFrameRef.current !== null) {
      window.cancelAnimationFrame(ghostFrameRef.current)
      ghostFrameRef.current = null
    }
    pendingGhostRef.current = null
    draggingRef.current = false
    armedRef.current = false
    pointerIdRef.current = null
    setIsArming(false)
    setGhost(null)
    emitDragState(false, false, false)
  }, [clearLongPressTimer, emitDragState])

  useEffect(() => {
    const handleGlobalPointerEnd = (event: globalThis.PointerEvent) => {
      if (pointerIdRef.current !== null && event.pointerId !== pointerIdRef.current) {
        return
      }
      if (draggingRef.current || armedRef.current) {
        reset()
      }
    }

    const handleWindowBlur = () => {
      if (draggingRef.current || armedRef.current) {
        reset()
      }
    }

    window.addEventListener('pointerup', handleGlobalPointerEnd)
    window.addEventListener('pointercancel', handleGlobalPointerEnd)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerEnd)
      window.removeEventListener('pointercancel', handleGlobalPointerEnd)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [reset])

  useEffect(() => {
    if (!isArming && !ghost) return

    document.body.classList.add('pip-drag-active')
    return () => {
      document.body.classList.remove('pip-drag-active')
    }
  }, [ghost, isArming])

  useEffect(() => {
    return () => {
      if (ghostFrameRef.current !== null) {
        window.cancelAnimationFrame(ghostFrameRef.current)
      }
    }
  }, [])

  const resolveDropTargets = useCallback(
    (clientX: number, clientY: number) => {
      const pinRect = dropTargetRef.current?.getBoundingClientRect()
      const deleteRect = deleteDropTargetRef?.current?.getBoundingClientRect()
      const overDelete = deleteRect
        ? pointInRect(clientX, clientY, deleteRect)
        : false
      const overPin =
        !overDelete && pinRect ? pointInRect(clientX, clientY, pinRect) : false

      return { overPin, overDelete }
    },
    [deleteDropTargetRef, dropTargetRef],
  )

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || !sourceTakeId) return
      // Chrome buttons (X/pin/unpin) layered over the drag surface must never
      // arm a drag — bail defensively on any interactive-element ancestor,
      // not just <button>, so this holds regardless of the exact element the
      // button library renders. The drag surface itself carries role="button"
      // for accessibility, and Element.closest() matches the starting element
      // before ascending — exclude currentTarget or every press on the drag
      // surface would bail out here before the gesture ever starts.
      const interactiveAncestor = (event.target as HTMLElement).closest(
        'button, a, label, input, [role="button"], [data-drag-ignore]',
      )
      if (interactiveAncestor && interactiveAncestor !== event.currentTarget) return

      clearLongPressTimer()
      startRef.current = { x: event.clientX, y: event.clientY }
      pointerIdRef.current = event.pointerId
      draggingRef.current = false
      armedRef.current = false
      setIsArming(false)

      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        /* pointer capture can fail if the press target leaves the tree */
      }

      longPressTimerRef.current = window.setTimeout(() => {
        armedRef.current = true
        setIsArming(true)
        emitDragState(false, true, false)
        if (hapticFeedback) {
          void triggerSelectionHaptic()
        }
      }, LONG_PRESS_MS)
    },
    [clearLongPressTimer, emitDragState, enabled, hapticFeedback, sourceTakeId],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
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
        if (hapticFeedback) {
          void triggerDragStartHaptic()
        }
      }

      if (!draggingRef.current) return

      event.preventDefault()

      const { overPin, overDelete } = resolveDropTargets(
        event.clientX,
        event.clientY,
      )

      scheduleGhost({
        x: event.clientX,
        y: event.clientY,
        overPin,
        overDelete,
      })
      emitDragState(true, false, overDelete)
    },
    [
      clearLongPressTimer,
      emitDragState,
      hapticFeedback,
      resolveDropTargets,
      scheduleGhost,
    ],
  )

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (pointerIdRef.current !== event.pointerId) return

      clearLongPressTimer()

      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      } catch {
        /* ignore pointer capture cleanup races */
      }

      const deltaX = event.clientX - startRef.current.x
      const deltaY = event.clientY - startRef.current.y
      const distance = Math.hypot(deltaX, deltaY)

      if (draggingRef.current && sourceTakeId) {
        const { overPin, overDelete } = resolveDropTargets(
          event.clientX,
          event.clientY,
        )
        if (overDelete) {
          onDelete?.(sourceTakeId)
        } else if (overPin) {
          onPin(sourceTakeId)
        }
      } else if (
        !armedRef.current &&
        !draggingRef.current &&
        distance < DRAG_THRESHOLD_PX
      ) {
        if (onTap) {
          // The drag-layer variant (role="button" div) has no Pressable
          // wrapper to supply tap haptics, unlike the plain-onExpand fallback
          // — give the tap-to-open-fullscreen gesture the same feedback here.
          if (hapticFeedback) triggerLightHaptic()
          onTap()
        }
      }

      reset()
    },
    [
      clearLongPressTimer,
      hapticFeedback,
      onDelete,
      onPin,
      onTap,
      reset,
      resolveDropTargets,
      sourceTakeId,
    ],
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
      style: { touchAction: 'none' as const },
    },
  }
}
