import type { PitchReadout } from '../../utils/pitchUtils'

/** Keys supported in Scale Rush v0.1 */
export const SCALE_RUSH_KEYS = ['C', 'F', 'Bb', 'Eb', 'G', 'D', 'A'] as const
export type ScaleRushKey = (typeof SCALE_RUSH_KEYS)[number]

const KEY_TO_PITCH_CLASS: Record<ScaleRushKey, number> = {
  C: 0,
  F: 5,
  Bb: 10,
  Eb: 3,
  G: 7,
  D: 2,
  A: 9,
}

const FLAT_LABELS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const
const SHARP_LABELS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const FLAT_KEYS = new Set<ScaleRushKey>(['F', 'Bb', 'Eb'])

/** Major scale semitone offsets for degrees 1–7; degree 8 = octave (+12). */
const MAJOR_DEGREE_SEMITONES = [0, 2, 4, 5, 7, 9, 11, 12] as const

/** Stepwise path: 1 2 3 4 5 6 7 8 7 6 5 4 3 2 1 (0-based degree indices). */
export const SCALE_DEGREE_PATH = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0] as const

export const SCALE_RUSH_BEST_SCORE_KEY = 'sessionmirror:scale-rush-best'

export function pitchClassForSequenceStep(key: ScaleRushKey, stepIndex: number): number {
  const degreeIndex = SCALE_DEGREE_PATH[stepIndex % SCALE_DEGREE_PATH.length]!
  const semitones = MAJOR_DEGREE_SEMITONES[degreeIndex]!
  return (KEY_TO_PITCH_CLASS[key] + semitones) % 12
}

export function pitchClassLabel(pitchClass: number, key: ScaleRushKey): string {
  const normalized = ((pitchClass % 12) + 12) % 12
  return FLAT_KEYS.has(key) ? FLAT_LABELS[normalized]! : SHARP_LABELS[normalized]!
}

/** Pitch-class match — octave is ignored for v0.1. */
export function pitchClassesMatch(detected: number, target: number): boolean {
  return ((detected % 12) + 12) % 12 === ((target % 12) + 12) % 12
}

const MIN_SIGNAL_HZ = 55

/**
 * Map live pitch readout to pitch class (0–11).
 * Returns null when there is no reliable signal.
 */
export function readoutToPitchClass(readout: PitchReadout): number | null {
  if (!Number.isFinite(readout.frequencyHz) || readout.frequencyHz < MIN_SIGNAL_HZ) return null
  if (!readout.noteName || readout.noteName === '—') return null
  return ((Math.round(readout.midi) % 12) + 12) % 12
}

/** Lenient intonation gate for gameplay (wider than tuner green zone). */
export function isReadoutStableEnough(readout: PitchReadout, toleranceCents = 40): boolean {
  if (readoutToPitchClass(readout) == null) return false
  return Math.abs(readout.cents) <= toleranceCents
}

export function loadBestScore(): number {
  try {
    const raw = localStorage.getItem(SCALE_RUSH_BEST_SCORE_KEY)
    const parsed = raw ? Number.parseInt(raw, 10) : 0
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  } catch {
    return 0
  }
}

export function saveBestScore(score: number): number {
  const current = loadBestScore()
  const next = Math.max(current, score)
  try {
    localStorage.setItem(SCALE_RUSH_BEST_SCORE_KEY, String(next))
  } catch {
    // ignore quota errors in labs prototype
  }
  return next
}

export function computeAccuracy(correct: number, misses: number): number {
  const total = correct + misses
  if (total === 0) return 100
  return Math.round((correct / total) * 1000) / 10
}
