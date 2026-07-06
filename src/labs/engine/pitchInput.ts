import { isInTune, TUNING_GREEN_CENTS, type PitchReadout } from '../../utils/pitchUtils'
import type { PitchInputSnapshot, PitchMatchResult } from './types'

const MIN_SIGNAL_HZ = 55

export function hasPitchSignal(readout: PitchReadout): boolean {
  return Number.isFinite(readout.frequencyHz) && readout.frequencyHz >= MIN_SIGNAL_HZ
}

export function createPitchSnapshot(readout: PitchReadout): PitchInputSnapshot {
  return {
    readout,
    hasSignal: hasPitchSignal(readout),
  }
}

/** Compare live pitch against a target MIDI note. */
export function evaluatePitchAgainstTarget(
  snapshot: PitchInputSnapshot,
  targetMidi: number,
  toleranceCents = TUNING_GREEN_CENTS,
): PitchMatchResult {
  if (!snapshot.hasSignal) return { kind: 'none' }

  const target = Math.round(targetMidi)
  const played = Math.round(snapshot.readout.midi)

  if (played !== target) {
    if (isInTune(snapshot.readout.cents, toleranceCents)) {
      return { kind: 'wrong' }
    }
    return { kind: 'none' }
  }

  return isInTune(snapshot.readout.cents, toleranceCents) ? { kind: 'match' } : { kind: 'none' }
}
