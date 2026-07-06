import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { triggerLongPressHaptic } from '../utils/haptics'

interface UseLongPressOptions {
  onClick: () => void
  onLongPress: () => void
  delay?: number
  disabled?: boolean
  hapticFeedback?: boolean
  targetRef?: RefObject<HTMLElement | null>
}

function clearTextSelection() {
  window.getSelection()?.removeAllRanges()
}

export function useLongPress({
  onClick,
  onLongPress,
  delay = 450,
  disabled = false,
  hapticFeedback = true,
  targetRef,
}: UseLongPressOptions) {
  const timerRef = useRef<number | null>(null)
  const longPressTriggeredRef = useRef(false)
  const pressingRef = useRef(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const endPress = useCallback(() => {
    clearTimer()
    pressingRef.current = false
    cleanupRef.current?.()
    cleanupRef.current = null
  }, [clearTimer])

  useEffect(() => () => endPress(), [endPress])

  useEffect(() => {
    const element = targetRef?.current
    if (!element || disabled) return

    const blockTouchCallout = (event: TouchEvent) => {
      event.preventDefault()
    }

    element.addEventListener('touchstart', blockTouchCallout, { passive: false })
    return () => element.removeEventListener('touchstart', blockTouchCallout)
  }, [disabled, targetRef])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (disabled || event.button !== 0) return

      longPressTriggeredRef.current = false
      pressingRef.current = true
      clearTimer()

      event.preventDefault()
      event.stopPropagation()

      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        /* ignore */
      }

      const preventNativeMenu = (nativeEvent: Event) => {
        nativeEvent.preventDefault()
      }

      document.addEventListener('contextmenu', preventNativeMenu, { capture: true })
      document.addEventListener('selectstart', preventNativeMenu, { capture: true })

      cleanupRef.current = () => {
        document.removeEventListener('contextmenu', preventNativeMenu, { capture: true })
        document.removeEventListener('selectstart', preventNativeMenu, { capture: true })
      }

      timerRef.current = window.setTimeout(() => {
        if (!pressingRef.current) return

        longPressTriggeredRef.current = true
        clearTextSelection()
        if (hapticFeedback) {
          void triggerLongPressHaptic()
        }
        onLongPress()
      }, delay)
    },
    [clearTimer, delay, disabled, hapticFeedback, onLongPress],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (disabled || event.button !== 0) return

      event.preventDefault()
      event.stopPropagation()

      const wasLongPress = longPressTriggeredRef.current
      endPress()

      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      } catch {
        /* ignore */
      }

      clearTextSelection()

      if (!wasLongPress) {
        onClick()
      }
    },
    [disabled, endPress, onClick],
  )

  const onPointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!pressingRef.current) return

      event.preventDefault()
      endPress()

      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      } catch {
        /* ignore */
      }
    },
    [endPress],
  )

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      event.preventDefault()
      endPress()

      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      } catch {
        /* ignore */
      }
    },
    [endPress],
  )

  const onClickCapture = useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }, [])

  return {
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    onClickCapture,
  }
}
