import type { PitchReadout } from '../../utils/pitchUtils'
import type { ScaleRushConfig } from './types'

/** Keys supported in Scale Rush v0.05 */
export const SCALE_RUSH_KEYS = ['C', 'F', 'Bb', 'Eb', 'G', 'D', 'A'] as const
export type ScaleRushKey = (typeof SCALE_RUSH_KEYS)[number]

export const SCALE_RUSH_SCALES = ['major'] as const
export type ScaleRushScale = (typeof SCALE_RUSH_SCALES)[number]

export const SCALE_RUSH_RANGES = ['1-octave'] as const
export type ScaleRushRange = (typeof SCALE_RUSH_RANGES)[number]

export const SCALE_LABELS: Record<ScaleRushScale, string> = {
  major: 'Major',
}

export const RANGE_LABELS: Record<ScaleRushRange, string> = {
  '1-octave': '1 Octave',
}

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

/** Stepwise path: C D E F G A B C B A G F E D C (1–8–1). */
export const SCALE_DEGREE_PATH = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0] as const

export const SCALE_RUSH_BEST_SCORE_KEY = 'sessionmirror:scale-rush-best'

export type RowTerrain = 'grass' | 'road' | 'river'

/** One row in the top-down course — labels come from the shared sequence only. */
export interface CourseRow {
  /** 0 = player row, 1 = next target, 2+ = upcoming */
  rowOffset: number
  sequenceIndex: number
  pitchClass: number
  noteLabel: string
  terrain: RowTerrain
  isTarget: boolean
  isPlayerRow: boolean
  isStart: boolean
}

// ---------------------------------------------------------------------------
// Single source of truth for note sequence (HUD + tiles + pitch check)
// ---------------------------------------------------------------------------

export function pitchClassForSequenceStep(key: ScaleRushKey, stepIndex: number): number {
  const degreeIndex = SCALE_DEGREE_PATH[stepIndex % SCALE_DEGREE_PATH.length]!
  const semitones = MAJOR_DEGREE_SEMITONES[degreeIndex]!
  return (KEY_TO_PITCH_CLASS[key] + semitones) % 12
}

export function pitchClassLabel(pitchClass: number, key: ScaleRushKey): string {
  const normalized = ((pitchClass % 12) + 12) % 12
  return FLAT_KEYS.has(key) ? FLAT_LABELS[normalized]! : SHARP_LABELS[normalized]!
}

/** Target note for gameplay at a given sequence step — feeds HUD and course row 1. */
export function getTargetNoteAtStep(config: ScaleRushConfig, sequenceStep: number): {
  sequenceIndex: number
  pitchClass: number
  noteLabel: string
} {
  const pitchClass = pitchClassForSequenceStep(config.key, sequenceStep)
  return {
    sequenceIndex: sequenceStep,
    pitchClass,
    noteLabel: pitchClassLabel(pitchClass, config.key),
  }
}

function terrainForRow(rowOffset: number): RowTerrain {
  const mod = rowOffset % 3
  if (mod === 1) return 'road'
  if (mod === 2) return 'river'
  return 'grass'
}

/**
 * Build visible course rows from the shared sequence.
 * rowOffset 1 is always the active target and matches getTargetNoteAtStep(sequenceStep).
 */
export function buildCourseRows(
  config: ScaleRushConfig,
  sequenceStep: number,
  visibleAhead = 6,
): CourseRow[] {
  const rows: CourseRow[] = []

  // Player row (bottom)
  if (sequenceStep === 0) {
    rows.push({
      rowOffset: 0,
      sequenceIndex: -1,
      pitchClass: -1,
      noteLabel: 'GO',
      terrain: 'grass',
      isTarget: false,
      isPlayerRow: true,
      isStart: true,
    })
  } else {
    const landed = getTargetNoteAtStep(config, sequenceStep - 1)
    rows.push({
      rowOffset: 0,
      sequenceIndex: landed.sequenceIndex,
      pitchClass: landed.pitchClass,
      noteLabel: landed.noteLabel,
      terrain: terrainForRow(0),
      isTarget: false,
      isPlayerRow: true,
      isStart: false,
    })
  }

  for (let ahead = 1; ahead <= visibleAhead; ahead += 1) {
    const note = getTargetNoteAtStep(config, sequenceStep + ahead - 1)
    rows.push({
      rowOffset: ahead,
      sequenceIndex: note.sequenceIndex,
      pitchClass: note.pitchClass,
      noteLabel: note.noteLabel,
      terrain: terrainForRow(ahead),
      isTarget: ahead === 1,
      isPlayerRow: false,
      isStart: false,
    })
  }

  return rows
}

/** Pitch-class match — octave ignored for v0.05. */
export function pitchClassesMatch(detected: number, target: number): boolean {
  return ((detected % 12) + 12) % 12 === ((target % 12) + 12) % 12
}

const MIN_SIGNAL_HZ = 55

/** Map live pitch readout to pitch class (0–11). */
export function readoutToPitchClass(readout: PitchReadout): number | null {
  if (!Number.isFinite(readout.frequencyHz) || readout.frequencyHz < MIN_SIGNAL_HZ) return null
  if (!readout.noteName || readout.noteName === '—') return null
  return ((Math.round(readout.midi) % 12) + 12) % 12
}

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
    // labs prototype
  }
  return next
}

export function computeAccuracy(correct: number, misses: number): number {
  const total = correct + misses
  if (total === 0) return 100
  return Math.round((correct / total) * 1000) / 10
}
