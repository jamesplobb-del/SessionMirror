import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from 'react'
import { triggerDragStartHaptic, triggerSelectionHaptic } from '../utils/haptics'

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

  const reset = useCallback(() => {
    clearLongPressTimer()
    draggingRef.current = false
    armedRef.current = false
    pointerIdRef.current = null
    setIsArming(false)
    setGhost(null)
    lastEmittedRef.current = {
      isDragging: false,
      isArming: false,
      overDelete: false,
    }
    emitDragState(false, false, false)
  }, [clearLongPressTimer, emitDragState])

  useEffect(() => {
    if (!isArming && !ghost) return

    document.body.classList.add('pip-drag-active')
    return () => {
      document.body.classList.remove('pip-drag-active')
    }
  }, [ghost, isArming])

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
        emitDragState(false, true, false)
        if (hapticFeedback) {
          void triggerSelectionHaptic()
        }
      }, LONG_PRESS_MS)
    },
    [clearLongPressTimer, emitDragState, enabled, hapticFeedback, sourceTakeId],
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

      setGhost({
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
    ],
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
        onTap?.()
      }

      reset()
    },
    [
      clearLongPressTimer,
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
    },
  }
}
