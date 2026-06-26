import { useCallback, useRef } from 'react'
import { clampBpm } from '../utils/metronomeConfig'

const TAP_RESET_MS = 2000
const MIN_TAPS = 2
const MAX_TAPS = 8

export function useTapTempo(onBpm: (bpm: number) => void) {
  const tapsRef = useRef<number[]>([])

  const registerTap = useCallback(() => {
    const now = performance.now()
    const taps = tapsRef.current

    if (taps.length > 0 && now - taps[taps.length - 1] > TAP_RESET_MS) {
      tapsRef.current = [now]
      return
    }

    tapsRef.current = [...taps, now].slice(-MAX_TAPS)

    const recent = tapsRef.current
    if (recent.length < MIN_TAPS) return

    const intervals: number[] = []
    for (let i = 1; i < recent.length; i++) {
      intervals.push(recent[i] - recent[i - 1])
    }
    const avgMs = intervals.reduce((sum, ms) => sum + ms, 0) / intervals.length
    onBpm(clampBpm(60000 / avgMs))
  }, [onBpm])

  return { registerTap }
}
