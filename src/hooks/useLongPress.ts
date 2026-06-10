import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'

interface UseLongPressOptions {
  onClick: () => void
  onLongPress: () => void
  delay?: number
  disabled?: boolean
}

export function useLongPress({
  onClick,
  onLongPress,
  delay = 450,
  disabled = false,
}: UseLongPressOptions) {
  const timerRef = useRef<number | null>(null)
  const longPressTriggeredRef = useRef(false)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (disabled || event.button !== 0) return

      longPressTriggeredRef.current = false
      clearTimer()
      timerRef.current = window.setTimeout(() => {
        longPressTriggeredRef.current = true
        onLongPress()
      }, delay)
    },
    [clearTimer, delay, disabled, onLongPress],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (disabled || event.button !== 0) return

      clearTimer()
      if (!longPressTriggeredRef.current) {
        onClick()
      }
    },
    [clearTimer, disabled, onClick],
  )

  const onPointerLeave = useCallback(() => {
    clearTimer()
  }, [clearTimer])

  const onPointerCancel = useCallback(() => {
    clearTimer()
  }, [clearTimer])

  return {
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
  }
}
