import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import {
  triggerConfirmedLongPressHaptic,
  triggerLongPressHaptic,
  warmHaptics,
} from '../utils/haptics'

interface UseLongPressOptions {
  onClick: () => void
  onLongPress: () => void
  delay?: number
  disabled?: boolean
  hapticFeedback?: boolean
  primeHapticsOnPointerDown?: boolean
  strongHapticFeedback?: boolean
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
  primeHapticsOnPointerDown = false,
  strongHapticFeedback = false,
  targetRef,
}: UseLongPressOptions) {
  const timerRef = useRef<number | null>(null)
  const longPressTriggeredRef = useRef(false)
  const pressingRef = useRef(false)
  const suppressClickUntilRef = useRef(0)
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled
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
    if (!disabled || !pressingRef.current) return
    suppressClickUntilRef.current = performance.now() + 500
    endPress()
  }, [disabled, endPress])

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
      if (hapticFeedback && primeHapticsOnPointerDown) {
        warmHaptics()
      }

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

      const pointerTarget = event.currentTarget
      const pointerId = event.pointerId
      cleanupRef.current = () => {
        try {
          if (pointerTarget.hasPointerCapture(pointerId)) pointerTarget.releasePointerCapture(pointerId)
        } catch {
          /* target may have been removed */
        }
        document.removeEventListener('contextmenu', preventNativeMenu, { capture: true })
        document.removeEventListener('selectstart', preventNativeMenu, { capture: true })
      }

      timerRef.current = window.setTimeout(() => {
        if (!pressingRef.current || disabledRef.current) return

        longPressTriggeredRef.current = true
        clearTextSelection()
        if (hapticFeedback) {
          void (strongHapticFeedback
            ? triggerConfirmedLongPressHaptic()
            : triggerLongPressHaptic())
        }
        onLongPress()
      }, delay)
    },
    [
      clearTimer,
      delay,
      disabled,
      hapticFeedback,
      onLongPress,
      primeHapticsOnPointerDown,
      strongHapticFeedback,
    ],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (disabled || event.button !== 0 || !pressingRef.current) return

      event.preventDefault()
      event.stopPropagation()

      suppressClickUntilRef.current = performance.now() + 500
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
      suppressClickUntilRef.current = performance.now() + 500
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
      suppressClickUntilRef.current = performance.now() + 500
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
    // Keyboard and assistive activation dispatch a native click without a
    // pointer press. Pointer taps already activate on release above.
    const followsPointer = performance.now() < suppressClickUntilRef.current
    suppressClickUntilRef.current = 0
    if (event.detail === 0 && !disabled && !pressingRef.current && !followsPointer) {
      onClick()
    }
    longPressTriggeredRef.current = false
  }, [disabled, onClick])

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      // A deliberate key press is independent of a preceding pointer gesture.
      suppressClickUntilRef.current = 0
    }
  }, [])

  return {
    onKeyDown,
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    onClickCapture,
  }
}
