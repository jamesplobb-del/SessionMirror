import { useEffect, useRef, useState } from 'react'
import { useMetronome } from './useMetronome'
import type { PitchReadout } from '../utils/pitchUtils'

/** Hold readout through click transient after each main beat. */
const METRONOME_SUPPRESS_MS = 96
/** Require stable cents before updating during live tuning. */
const READOUT_STABILITY_MS = 36
/** Require stable note before accepting a note change while metronome runs. */
const NOTE_CHANGE_STABILITY_MS = 72
/** Ignore cent spikes vs held readout during suppression. */
const SPIKE_REJECT_CENTS = 18

function computeTickSuppressMs(bpm: number): number {
  const beatMs = 60000 / Math.max(bpm, 40)
  return Math.min(METRONOME_SUPPRESS_MS, beatMs * 0.26)
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
): { readout: PitchReadout; inTuneGlow: number; suppressing: boolean } {
  const { enabled = true, metronomeGate = true } = options
  const { playing: metronomePlaying, beatPulseId, bpm, subTickIndex } = useMetronome()

  const [displayReadout, setDisplayReadout] = useState(rawReadout)
  const [displayGlow, setDisplayGlow] = useState(rawInTuneGlow)
  const [suppressing, setSuppressing] = useState(false)

  const heldReadoutRef = useRef(rawReadout)
  const heldGlowRef = useRef(rawInTuneGlow)
  const suppressUntilRef = useRef(0)
  const lastMainBeatPulseRef = useRef(beatPulseId)
  const pendingReadoutRef = useRef<PitchReadout | null>(null)
  const pendingSinceRef = useRef(0)
  const pendingNoteRef = useRef<string | null>(null)
  const pendingNoteSinceRef = useRef(0)

  useEffect(() => {
    if (!enabled) {
      heldReadoutRef.current = rawReadout
      heldGlowRef.current = rawInTuneGlow
      setDisplayReadout(rawReadout)
      setDisplayGlow(rawInTuneGlow)
      setSuppressing(false)
      pendingReadoutRef.current = null
      pendingNoteRef.current = null
      return
    }

    if (
      metronomeGate &&
      metronomePlaying &&
      subTickIndex === 0 &&
      beatPulseId !== lastMainBeatPulseRef.current
    ) {
      lastMainBeatPulseRef.current = beatPulseId
      suppressUntilRef.current = performance.now() + computeTickSuppressMs(bpm)
    }

    const now = performance.now()
    const inSuppressWindow =
      metronomeGate && metronomePlaying && now < suppressUntilRef.current
    setSuppressing(inSuppressWindow)

    if (inSuppressWindow) {
      setDisplayGlow(heldGlowRef.current)
      return
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

    if (
      metronomeGate &&
      metronomePlaying &&
      noteChanged &&
      rawReadout.noteName !== '—'
    ) {
      const pendingNote = pendingNoteRef.current
      if (pendingNote !== rawReadout.noteName) {
        pendingNoteRef.current = rawReadout.noteName
        pendingNoteSinceRef.current = now
        setDisplayGlow(rawInTuneGlow)
        return
      }
      if (now - pendingNoteSinceRef.current < NOTE_CHANGE_STABILITY_MS) {
        setDisplayGlow(rawInTuneGlow)
        return
      }
      pendingNoteRef.current = null
    } else if (noteChanged) {
      pendingNoteRef.current = null
    }

    if (
      metronomeGate &&
      metronomePlaying &&
      !noteChanged &&
      rawReadout.noteName !== '—' &&
      heldReadoutRef.current.noteName !== '—' &&
      Math.abs(rawReadout.cents - heldReadoutRef.current.cents) > SPIKE_REJECT_CENTS
    ) {
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
  }, [
    rawReadout,
    rawInTuneGlow,
    enabled,
    metronomeGate,
    metronomePlaying,
    beatPulseId,
    bpm,
    subTickIndex,
  ])

  if (!enabled) {
    return { readout: rawReadout, inTuneGlow: rawInTuneGlow, suppressing: false }
  }

  return { readout: displayReadout, inTuneGlow: displayGlow, suppressing }
}
