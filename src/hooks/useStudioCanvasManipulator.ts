import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { StudioGuideLine, StudioTransform } from '../creatorStudio/types'

const SNAP_THRESHOLD = 3
const EDGE_SNAP = 8
const CENTER_SNAP = 50

export interface CanvasManipulatorOptions {
  stageRef: RefObject<HTMLElement | null>
  transform: StudioTransform
  enabled: boolean
  peerPositions?: Array<{ x: number; y: number }>
  onChange: (next: StudioTransform) => void
}

function snapAxis(
  axis: 'x' | 'y',
  value: number,
  peers: Array<{ x: number; y: number }>,
): { value: number; guides: StudioGuideLine[] } {
  const candidates =
    axis === 'x'
      ? [EDGE_SNAP, CENTER_SNAP, 100 - EDGE_SNAP, ...peers.map((peer) => peer.x)]
      : [EDGE_SNAP, CENTER_SNAP, 100 - EDGE_SNAP, ...peers.map((peer) => peer.y)]

  const guides: StudioGuideLine[] = []
  let next = value

  for (const candidate of candidates) {
    if (Math.abs(value - candidate) <= SNAP_THRESHOLD) {
      next = candidate
      guides.push({
        orientation: axis === 'x' ? 'vertical' : 'horizontal',
        position: candidate,
      })
      break
    }
  }

  return { value: Math.min(96, Math.max(4, next)), guides }
}

function clampPercent(value: number): number {
  return Math.min(96, Math.max(4, value))
}

export function useStudioCanvasManipulator({
  stageRef,
  transform,
  enabled,
  peerPositions = [],
  onChange,
}: CanvasManipulatorOptions) {
  const transformRef = useRef(transform)
  transformRef.current = transform

  const [activeGuides, setActiveGuides] = useState<StudioGuideLine[]>([])

  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  const pinchRef = useRef<{ distance: number; scale: number } | null>(null)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return
      event.stopPropagation()

      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (pointersRef.current.size >= 2) {
        const points = [...pointersRef.current.values()]
        pinchRef.current = {
          distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
          scale: transformRef.current.scale,
        }
        dragRef.current = null
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        return
      }

      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: transformRef.current.x,
        originY: transformRef.current.y,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [enabled],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return

      if (pointersRef.current.has(event.pointerId)) {
        pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      }

      if (pointersRef.current.size >= 2 && pinchRef.current) {
        event.preventDefault()
        event.stopPropagation()
        const points = [...pointersRef.current.values()]
        const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
        if (distance <= 0 || pinchRef.current.distance <= 0) return
        const nextScale = Math.min(
          2.6,
          Math.max(0.3, pinchRef.current.scale * (distance / pinchRef.current.distance)),
        )
        onChange({ ...transformRef.current, scale: nextScale })
        return
      }

      const drag = dragRef.current
      const stage = stageRef.current
      if (!drag || drag.pointerId !== event.pointerId || !stage) return

      event.preventDefault()
      event.stopPropagation()

      const rect = stage.getBoundingClientRect()
      const deltaX = ((event.clientX - drag.startX) / rect.width) * 100
      const deltaY = ((event.clientY - drag.startY) / rect.height) * 100

      const rawX = clampPercent(drag.originX + deltaX)
      const rawY = clampPercent(drag.originY + deltaY)
      const snappedX = snapAxis('x', rawX, peerPositions)
      const snappedY = snapAxis('y', rawY, peerPositions)

      setActiveGuides([...snappedX.guides, ...snappedY.guides])
      onChange({
        ...transformRef.current,
        x: snappedX.value,
        y: snappedY.value,
      })
    },
    [enabled, onChange, peerPositions, stageRef],
  )

  const clearInteraction = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    pointersRef.current.delete(event.pointerId)
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
    if (pointersRef.current.size < 2) pinchRef.current = null
    setActiveGuides([])
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  return {
    activeGuides,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: clearInteraction,
    handlePointerCancel: clearInteraction,
  }
}
