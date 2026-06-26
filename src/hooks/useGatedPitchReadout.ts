import { useEffect, useRef, useState } from 'react'
import { useMetronome } from './useMetronome'
import type { PitchReadout } from '../utils/pitchUtils'

/** Suppress readout updates briefly after each metronome tick (click transient). */
const METRONOME_SUPPRESS_MS = 58
/** Minimum interval between note/cents display updates during live mic tuning. */
const READOUT_STABILITY_MS = 38
/** Ignore single-frame cent spikes larger than this vs held readout during suppression. */
const SPIKE_REJECT_CENTS = 22

function computeTickSuppressMs(bpm: number): number {
  const beatMs = 60000 / Math.max(bpm, 40)
  return Math.min(METRONOME_SUPPRESS_MS, beatMs * 0.14)
}

interface GatedPitchReadoutOptions {
  enabled?: boolean
  /** Gate only when metronome is audibly running. */
  metronomeGate?: boolean
}

/**
 * Consumes raw pitch tracker output and metronome tick timing.
 * Holds the last stable readout through click-like transients without touching detection core.
 */
export function useGatedPitchReadout(
  rawReadout: PitchReadout,
  rawInTuneGlow: number,
  options: GatedPitchReadoutOptions = {},
): { readout: PitchReadout; inTuneGlow: number } {
  const { enabled = true, metronomeGate = true } = options
  const { playing: metronomePlaying, beatPulseId, bpm } = useMetronome()

  const [displayReadout, setDisplayReadout] = useState(rawReadout)
  const [displayGlow, setDisplayGlow] = useState(rawInTuneGlow)

  const heldReadoutRef = useRef(rawReadout)
  const heldGlowRef = useRef(rawInTuneGlow)
  const suppressUntilRef = useRef(0)
  const lastBeatPulseRef = useRef(beatPulseId)
  const pendingReadoutRef = useRef<PitchReadout | null>(null)
  const pendingSinceRef = useRef(0)

  useEffect(() => {
    if (!enabled) {
      heldReadoutRef.current = rawReadout
      heldGlowRef.current = rawInTuneGlow
      setDisplayReadout(rawReadout)
      setDisplayGlow(rawInTuneGlow)
      pendingReadoutRef.current = null
      return
    }

    if (metronomeGate && metronomePlaying && beatPulseId !== lastBeatPulseRef.current) {
      lastBeatPulseRef.current = beatPulseId
      suppressUntilRef.current = performance.now() + computeTickSuppressMs(bpm)
    }

    const now = performance.now()
    const inSuppressWindow = metronomeGate && metronomePlaying && now < suppressUntilRef.current

    if (inSuppressWindow) {
      const held = heldReadoutRef.current
      if (
        rawReadout.noteName !== '—' &&
        held.noteName !== '—' &&
        rawReadout.noteName === held.noteName &&
        Math.abs(rawReadout.cents - held.cents) > SPIKE_REJECT_CENTS
      ) {
        setDisplayGlow(rawInTuneGlow)
        return
      }
    }

    const noteChanged = rawReadout.noteName !== heldReadoutRef.current.noteName
    const centsDelta = Math.abs(rawReadout.cents - heldReadoutRef.current.cents)
    const significantChange =
      noteChanged || centsDelta >= 0.45 || rawReadout.noteName === '—'

    if (!significantChange) {
      heldGlowRef.current = rawInTuneGlow
      setDisplayGlow(rawInTuneGlow)
      return
    }

    if (inSuppressWindow && !noteChanged && rawReadout.noteName !== '—') {
      setDisplayGlow(rawInTuneGlow)
      return
    }

    const pending = pendingReadoutRef.current
    if (
      !noteChanged &&
      rawReadout.noteName !== '—' &&
      pending &&
      pending.noteName === rawReadout.noteName &&
      Math.abs(pending.cents - rawReadout.cents) < 1.25 &&
      now - pendingSinceRef.current < READOUT_STABILITY_MS
    ) {
      heldReadoutRef.current = rawReadout
      heldGlowRef.current = rawInTuneGlow
      pendingReadoutRef.current = null
      setDisplayReadout(rawReadout)
      setDisplayGlow(rawInTuneGlow)
      return
    }

    if (
      !noteChanged &&
      rawReadout.noteName !== '—' &&
      (!pending ||
        pending.noteName !== rawReadout.noteName ||
        Math.abs(pending.cents - rawReadout.cents) >= 1.25)
    ) {
      pendingReadoutRef.current = rawReadout
      pendingSinceRef.current = now
      setDisplayGlow(rawInTuneGlow)
      return
    }

    heldReadoutRef.current = rawReadout
    heldGlowRef.current = rawInTuneGlow
    pendingReadoutRef.current = null
    setDisplayReadout(rawReadout)
    setDisplayGlow(rawInTuneGlow)
  }, [rawReadout, rawInTuneGlow, enabled, metronomeGate, metronomePlaying, beatPulseId, bpm])

  if (!enabled) {
    return { readout: rawReadout, inTuneGlow: rawInTuneGlow }
  }

  return { readout: displayReadout, inTuneGlow: displayGlow }
}
