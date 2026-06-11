import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

export interface PinchSize {
  width: number
  height: number
}

interface UsePinchResizeOptions {
  initial: PinchSize
  min: PinchSize
  max: PinchSize
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clampSizeToBox(
  width: number,
  height: number,
  min: PinchSize,
  max: PinchSize,
  aspect: number,
): PinchSize {
  let nextWidth = width
  let nextHeight = height

  if (nextWidth > max.width) {
    nextWidth = max.width
    nextHeight = nextWidth / aspect
  }
  if (nextHeight > max.height) {
    nextHeight = max.height
    nextWidth = nextHeight * aspect
  }
  if (nextWidth < min.width) {
    nextWidth = min.width
    nextHeight = nextWidth / aspect
  }
  if (nextHeight < min.height) {
    nextHeight = min.height
    nextWidth = nextHeight * aspect
  }

  return {
    width: clamp(nextWidth, min.width, max.width),
    height: clamp(nextHeight, min.height, max.height),
  }
}

export function usePinchResize({ initial, min, max }: UsePinchResizeOptions) {
  const [size, setSize] = useState(initial)
  const [pinching, setPinching] = useState(false)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchStartRef = useRef<{ distance: number; width: number; height: number } | null>(null)
  const aspectRef = useRef(initial.width / initial.height)
  aspectRef.current = initial.width / initial.height

  const resetPinch = useCallback(() => {
    pointersRef.current.clear()
    pinchStartRef.current = null
    setPinching(false)
  }, [])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (pointersRef.current.size >= 2) {
        const points = [...pointersRef.current.values()]
        pinchStartRef.current = {
          distance: distance(points[0], points[1]),
          width: size.width,
          height: size.height,
        }
        setPinching(true)
        event.preventDefault()
        event.stopPropagation()
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          /* ignore unsupported capture */
        }
      }
    },
    [size.height, size.width],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!pointersRef.current.has(event.pointerId)) return

      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (pointersRef.current.size < 2 || !pinchStartRef.current) return

      event.preventDefault()
      event.stopPropagation()

      const points = [...pointersRef.current.values()]
      const nextDistance = distance(points[0], points[1])
      if (nextDistance <= 0 || pinchStartRef.current.distance <= 0) return

      const scale = nextDistance / pinchStartRef.current.distance
      const scaledWidth = pinchStartRef.current.width * scale
      const scaledHeight = scaledWidth / aspectRef.current
      setSize(clampSizeToBox(scaledWidth, scaledHeight, min, max, aspectRef.current))
    },
    [max.height, max.width, min.height, min.width],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      pointersRef.current.delete(event.pointerId)

      if (pointersRef.current.size < 2) {
        resetPinch()
      } else if (pointersRef.current.size >= 2) {
        const points = [...pointersRef.current.values()]
        pinchStartRef.current = {
          distance: distance(points[0], points[1]),
          width: size.width,
          height: size.height,
        }
      }
    },
    [resetPinch, size.height, size.width],
  )

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      pointersRef.current.delete(event.pointerId)
      if (pointersRef.current.size < 2) {
        resetPinch()
      }
    },
    [resetPinch],
  )

  const resetSize = useCallback(() => {
    setSize(initial)
  }, [initial.height, initial.width])

  return {
    size,
    pinching,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    resetPinch,
    resetSize,
    setSize,
  }
}
