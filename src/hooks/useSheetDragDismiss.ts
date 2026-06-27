import { useDragControls, type PanInfo } from 'framer-motion'
import { useCallback, useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'
import { iosSheetDragTransition } from '../utils/motionPresets'

export function readSheetSlideDistance(): number {
  if (typeof window === 'undefined') return 800
  return window.visualViewport?.height ?? window.innerHeight
}

const DISMISS_VELOCITY_PX_S = 720
const DISMISS_DISTANCE_RATIO = 0.24
const BACKDROP_FADE_RATIO = 0.38
const DISMISS_VELOCITY_PROJECTION_S = 0.16
const MAX_BACKDROP_FADE = 0.58

export interface UseSheetDragDismissOptions {
  enabled: boolean
  slideDistance: number
  onDismiss: () => void
}

export function useSheetDragDismiss({
  enabled,
  slideDistance,
  onDismiss,
}: UseSheetDragDismissOptions) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const dragActive = enabled && !prefersReducedMotion
  const dragControls = useDragControls()
  const [backdropOpacity, setBackdropOpacity] = useState(1)

  const dismissDistance = slideDistance * DISMISS_DISTANCE_RATIO

  useEffect(() => {
    if (!enabled) {
      setBackdropOpacity(1)
    }
  }, [enabled])

  const onDragStart = useCallback(() => {
    setBackdropOpacity(1)
  }, [])

  const onDrag = useCallback(
    (_event: unknown, info: PanInfo) => {
      const offsetY = Math.max(0, info.offset.y)
      const fade = Math.min(MAX_BACKDROP_FADE, offsetY / (slideDistance * BACKDROP_FADE_RATIO))
      setBackdropOpacity(1 - fade)
    },
    [slideDistance],
  )

  const onDragEnd = useCallback(
    (_event: unknown, info: PanInfo) => {
      const offsetY = Math.max(0, info.offset.y)
      const projectedOffset =
        offsetY + Math.max(0, info.velocity.y) * DISMISS_VELOCITY_PROJECTION_S
      const shouldDismiss =
        info.velocity.y > DISMISS_VELOCITY_PX_S || projectedOffset > dismissDistance
      if (shouldDismiss) {
        onDismiss()
      } else {
        setBackdropOpacity(1)
      }
    },
    [dismissDistance, onDismiss],
  )

  const startDrag = useCallback(
    (event: ReactPointerEvent) => {
      if (!dragActive) return
      dragControls.start(event)
    },
    [dragActive, dragControls],
  )

  const sheetDragProps = useMemo(
    () =>
      dragActive
        ? {
            drag: 'y' as const,
            dragControls,
            dragListener: false,
            dragConstraints: { top: 0, bottom: 0 },
            dragElastic: { top: 0.16, bottom: 0.62 },
            dragMomentum: false,
            dragDirectionLock: true,
            dragTransition: iosSheetDragTransition,
            onDragStart,
            onDrag,
            onDragEnd,
          }
        : {},
    [dragActive, dragControls, onDrag, onDragEnd, onDragStart],
  )

  const dragHandleProps = useMemo(
    () => ({
      onPointerDown: startDrag,
      className: 'sheet-drag-handle flex shrink-0 touch-none select-none flex-col items-center',
      style: dragActive ? ({ touchAction: 'none' } as const) : undefined,
      'aria-hidden': true as const,
    }),
    [dragActive, startDrag],
  )

  return {
    dragActive,
    sheetDragProps,
    dragHandleProps,
    backdropOpacity,
  }
}
