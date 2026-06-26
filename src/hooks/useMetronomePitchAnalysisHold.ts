import { useEffect, useRef, useState } from 'react'
import { useMetronome } from './useMetronome'

function computeHoldMs(bpm: number): number {
  const beatMs = 60000 / Math.max(bpm, 40)
  return Math.min(96, beatMs * 0.26)
}

/**
 * Briefly pauses live mic pitch analysis on main metronome beats so click transients
 * are not fed into the tracker. Does not touch metronome or pitch detection internals.
 */
export function useMetronomePitchAnalysisHold(enabled = true): boolean {
  const { playing, beatPulseId, bpm, subTickIndex } = useMetronome()
  const [holding, setHolding] = useState(false)
  const lastPulseRef = useRef(beatPulseId)

  useEffect(() => {
    if (!enabled || !playing) {
      setHolding(false)
      return
    }

    if (subTickIndex !== 0 || beatPulseId === lastPulseRef.current) {
      return
    }

    lastPulseRef.current = beatPulseId
    const holdMs = computeHoldMs(bpm)
    setHolding(true)
    const timer = window.setTimeout(() => setHolding(false), holdMs)
    return () => window.clearTimeout(timer)
  }, [enabled, playing, beatPulseId, bpm, subTickIndex])

  return holding
}
