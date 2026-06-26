import { useCallback, useRef } from 'react'
import { clampBpm, MAX_BPM, MIN_BPM } from '../utils/metronomeConfig'

const TAP_RESET_MS = 2000
const MIN_TAPS = 2
const MAX_TAPS = 8

export interface UseTapTempoOptions {
  minBpm?: number
  maxBpm?: number
}

function clampTapBpm(value: number, minBpm: number, maxBpm: number): number {
  return Math.min(maxBpm, Math.max(minBpm, Math.round(value)))
}

export function useTapTempo(onBpm: (bpm: number) => void, options?: UseTapTempoOptions) {
  const minBpm = options?.minBpm ?? MIN_BPM
  const maxBpm = options?.maxBpm ?? MAX_BPM
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
    const nextBpm =
      minBpm === MIN_BPM && maxBpm === MAX_BPM
        ? clampBpm(60000 / avgMs)
        : clampTapBpm(60000 / avgMs, minBpm, maxBpm)
    onBpm(nextBpm)
  }, [maxBpm, minBpm, onBpm])

  return { registerTap }
}
