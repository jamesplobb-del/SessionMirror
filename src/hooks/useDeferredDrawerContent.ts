import { useCallback, useEffect, useRef, useState } from 'react'
import { iosSheetPremiumDurationMs } from '../utils/motionPresets'

/**
 * Defers heavy drawer content until the sheet enter animation completes.
 * Uses onAnimationComplete when wired; falls back to a duration-matched timeout.
 */
export function useDeferredDrawerContent(
  isOpen: boolean,
  enterDurationMs = iosSheetPremiumDurationMs,
) {
  const [contentReady, setContentReady] = useState(false)
  const fallbackTimerRef = useRef<number | null>(null)

  const clearFallback = useCallback(() => {
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current)
      fallbackTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      clearFallback()
      setContentReady(false)
      return
    }

    fallbackTimerRef.current = window.setTimeout(() => {
      setContentReady(true)
      fallbackTimerRef.current = null
    }, enterDurationMs)

    return clearFallback
  }, [clearFallback, enterDurationMs, isOpen])

  const markContentReady = useCallback(() => {
    clearFallback()
    setContentReady(true)
  }, [clearFallback])

  return { contentReady, markContentReady }
}
