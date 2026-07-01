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

/** Written-pitch transposition: concert mic → note name shown on your instrument. */
export const SCALE_RUSH_TRANSPOSITIONS = [
  { id: 'concert', label: 'Concert Pitch (C)', semitonesToWritten: 0 },
  { id: 'bb', label: 'Bb — Trumpet, Clarinet, Tenor Sax', semitonesToWritten: 2 },
  { id: 'eb', label: 'Eb — Alto Sax, Baritone Sax', semitonesToWritten: 9 },
  { id: 'f', label: 'F — French Horn', semitonesToWritten: 7 },
  { id: 'g', label: 'G — Alto Flute', semitonesToWritten: 5 },
  { id: 'a', label: 'A — Clarinet in A', semitonesToWritten: 3 },
] as const

export type ScaleRushTransposition = (typeof SCALE_RUSH_TRANSPOSITIONS)[number]['id']

export const STRICT_PITCH_CENTS = 15

const TRANSPOSITION_MAP = Object.fromEntries(
  SCALE_RUSH_TRANSPOSITIONS.map((item) => [item.id, item.semitonesToWritten]),
) as Record<ScaleRushTransposition, number>

export function getTranspositionLabel(id: ScaleRushTransposition): string {
  return SCALE_RUSH_TRANSPOSITIONS.find((item) => item.id === id)?.label ?? 'Concert Pitch'
}

export function transpositionSemitones(id: ScaleRushTransposition): number {
  return TRANSPOSITION_MAP[id] ?? 0
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

/** Crossy-style tile accent colors by pitch class. */
export const NOTE_TILE_COLORS: Record<number, string> = {
  0: '#ef5350',
  1: '#ff7043',
  2: '#ffa726',
  3: '#ffca28',
  4: '#ffee58',
  5: '#9ccc65',
  6: '#26a69a',
  7: '#29b6f6',
  8: '#42a5f5',
  9: '#7e57c2',
  10: '#ab47bc',
  11: '#ec407a',
}

export type RowTerrain = 'grass' | 'road' | 'river'

export interface CourseRow {
  rowOffset: number
  sequenceIndex: number
  pitchClass: number
  noteLabel: string
  terrain: RowTerrain
  isTarget: boolean
  isPlayerRow: boolean
  isStart: boolean
}

export function pitchClassForSequenceStep(key: ScaleRushKey, stepIndex: number): number {
  const degreeIndex = SCALE_DEGREE_PATH[stepIndex % SCALE_DEGREE_PATH.length]!
  const semitones = MAJOR_DEGREE_SEMITONES[degreeIndex]!
  return (KEY_TO_PITCH_CLASS[key] + semitones) % 12
}

export function pitchClassLabel(pitchClass: number, key: ScaleRushKey): string {
  const normalized = ((pitchClass % 12) + 12) % 12
  return FLAT_KEYS.has(key) ? FLAT_LABELS[normalized]! : SHARP_LABELS[normalized]!
}

export function noteTileColor(pitchClass: number): string {
  const normalized = ((pitchClass % 12) + 12) % 12
  return NOTE_TILE_COLORS[normalized] ?? '#94a3b8'
}

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

export function buildCourseRows(
  config: ScaleRushConfig,
  sequenceStep: number,
  visibleAhead = 6,
): CourseRow[] {
  const rows: CourseRow[] = []

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

export function pitchClassesMatch(detected: number, target: number): boolean {
  return ((detected % 12) + 12) % 12 === ((target % 12) + 12) % 12
}

/** Gameplay-only pitch gates — stricter than casual tuner display to reject room noise. */
const MIN_GAMEPLAY_HZ = 80
const MAX_GAMEPLAY_HZ = 1400
const LOOSE_MIN_GAMEPLAY_HZ = 70

export function readoutToConcertPitchClass(readout: PitchReadout): number | null {
  if (!Number.isFinite(readout.frequencyHz) || readout.frequencyHz < LOOSE_MIN_GAMEPLAY_HZ) return null
  if (readout.frequencyHz > MAX_GAMEPLAY_HZ) return null
  if (!readout.noteName || readout.noteName === '—') return null
  return ((Math.round(readout.midi) % 12) + 12) % 12
}

function hasGameplaySignal(readout: PitchReadout, strict: boolean): boolean {
  const minHz = strict ? MIN_GAMEPLAY_HZ : LOOSE_MIN_GAMEPLAY_HZ
  if (!Number.isFinite(readout.frequencyHz) || readout.frequencyHz < minHz) return false
  if (readout.frequencyHz > MAX_GAMEPLAY_HZ) return false
  return Boolean(readout.noteName && readout.noteName !== '—')
}

/** Concert pitch class → written pitch for the selected transposing instrument. */
export function concertToWrittenPitchClass(
  concertPitchClass: number,
  transposition: ScaleRushTransposition,
): number {
  const shift = transpositionSemitones(transposition)
  return ((concertPitchClass + shift) % 12 + 12) % 12
}

/** Detected note in written pitch — used for HUD, tiles, and gameplay match. */
export function getDetectedWrittenPitchClass(
  readout: PitchReadout,
  config: ScaleRushConfig,
): number | null {
  const concert = readoutToConcertPitchClass(readout)
  if (concert == null) return null
  if (!hasGameplaySignal(readout, config.pitchAccuracyStrict)) return null
  return concertToWrittenPitchClass(concert, config.transposition)
}

export function isGameplayPitchSignal(readout: PitchReadout, config: ScaleRushConfig): boolean {
  return getDetectedWrittenPitchClass(readout, config) != null
}

export function isReadoutCorrectPitch(
  readout: PitchReadout,
  targetWrittenPitchClass: number,
  config: ScaleRushConfig,
): boolean {
  const detected = getDetectedWrittenPitchClass(readout, config)
  if (detected == null) return false
  if (!pitchClassesMatch(detected, targetWrittenPitchClass)) return false
  if (!config.pitchAccuracyStrict) return true
  return Math.abs(readout.cents) <= STRICT_PITCH_CENTS
}

export function isReadoutWrongPitch(
  readout: PitchReadout,
  targetWrittenPitchClass: number,
  config: ScaleRushConfig,
): boolean {
  const detected = getDetectedWrittenPitchClass(readout, config)
  if (detected == null) return false
  if (pitchClassesMatch(detected, targetWrittenPitchClass)) return false
  if (!config.pitchAccuracyStrict) return true
  return Math.abs(readout.cents) <= STRICT_PITCH_CENTS
}

/** @deprecated Use readoutToConcertPitchClass — kept for tuner raw display. */
export function readoutToPitchClass(readout: PitchReadout): number | null {
  return readoutToConcertPitchClass(readout)
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
