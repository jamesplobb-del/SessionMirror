import type { PitchReadout } from '../../utils/pitchUtils'
import type { ScaleRushConfig } from './scaleRushTypes'

/** All major scale key centers. */
export const SCALE_RUSH_MAJOR_KEYS = [
  'C',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'Gb',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
] as const

/** All natural minor scale key centers. */
export const SCALE_RUSH_MINOR_KEYS = [
  'A',
  'Bb',
  'B',
  'C',
  'C#',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'G',
  'G#',
] as const

export type ScaleRushMajorKey = (typeof SCALE_RUSH_MAJOR_KEYS)[number]
export type ScaleRushMinorKey = (typeof SCALE_RUSH_MINOR_KEYS)[number]
export type ScaleRushKey = ScaleRushMajorKey | ScaleRushMinorKey

export type ScaleRushScaleMode = 'major' | 'minor'

export const SCALE_RUSH_RANGES = ['1-octave', '2-octaves'] as const
export type ScaleRushRange = (typeof SCALE_RUSH_RANGES)[number]

export const SCALE_MODE_LABELS: Record<ScaleRushScaleMode, string> = {
  major: 'Major',
  minor: 'Natural Minor',
}

export const RANGE_LABELS: Record<ScaleRushRange, string> = {
  '1-octave': '1 Octave',
  '2-octaves': '2 Octaves',
}

/** @deprecated Use SCALE_RUSH_MAJOR_KEYS / scaleMode */
export const SCALE_RUSH_KEYS = SCALE_RUSH_MAJOR_KEYS
/** @deprecated Use scaleMode */
export const SCALE_RUSH_SCALES = ['major', 'minor'] as const
export type ScaleRushScale = ScaleRushScaleMode
/** @deprecated Use SCALE_MODE_LABELS */
export const SCALE_LABELS = SCALE_MODE_LABELS

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

const KEY_TO_PITCH_CLASS: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
}

const FLAT_LABELS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const
const SHARP_LABELS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

const MAJOR_PATTERN = [0, 2, 4, 5, 7, 9, 11] as const
const MINOR_PATTERN = [0, 2, 3, 5, 7, 8, 10] as const

export const SCALE_RUSH_BEST_SCORE_KEY = 'sessionmirror:scale-rush-best'

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

export function getTranspositionLabel(id: ScaleRushTransposition): string {
  return SCALE_RUSH_TRANSPOSITIONS.find((item) => item.id === id)?.label ?? 'Concert Pitch'
}

export function transpositionSemitones(id: ScaleRushTransposition): number {
  return TRANSPOSITION_MAP[id] ?? 0
}

export function keysForScaleMode(scaleMode: ScaleRushScaleMode): readonly ScaleRushKey[] {
  return scaleMode === 'major' ? SCALE_RUSH_MAJOR_KEYS : SCALE_RUSH_MINOR_KEYS
}

export function scaleDisplayName(key: ScaleRushKey, scaleMode: ScaleRushScaleMode): string {
  return `${key} ${SCALE_MODE_LABELS[scaleMode]}`
}

function scalePattern(scaleMode: ScaleRushScaleMode): readonly number[] {
  return scaleMode === 'major' ? MAJOR_PATTERN : MINOR_PATTERN
}

function prefersFlatSpelling(key: ScaleRushKey): boolean {
  return key.includes('b') || key === 'F' || key === 'Db' || key === 'Gb' || key === 'Ab' || key === 'Eb'
}

function keyPitchClass(key: ScaleRushKey): number {
  const pc = KEY_TO_PITCH_CLASS[key]
  if (pc == null) return 0
  return pc
}

/** Build ascending + descending degree indices for the configured range/mode. */
export function buildScaleDegreePath(config: Pick<ScaleRushConfig, 'range' | 'endless' | 'scaleMode'>): number[] {
  const octaves = config.range === '1-octave' ? 1 : 2
  const topDegree = octaves * 7
  const ascending = Array.from({ length: topDegree + 1 }, (_, index) => index)

  if (config.endless) {
    return ascending
  }

  const descending = Array.from({ length: topDegree }, (_, index) => topDegree - 1 - index)
  return [...ascending, ...descending]
}

function pitchClassForDegree(key: ScaleRushKey, scaleMode: ScaleRushScaleMode, degreeIndex: number): number {
  const pattern = scalePattern(scaleMode)
  const octave = Math.floor(degreeIndex / 7)
  const degreeInOctave = degreeIndex % 7
  const semitone = pattern[degreeInOctave]! + octave * 12
  return (keyPitchClass(key) + semitone) % 12
}

export function pitchClassForSequenceStep(config: ScaleRushConfig, stepIndex: number): number {
  const path = buildScaleDegreePath(config)
  const degreeIndex = path[stepIndex % path.length]!
  return pitchClassForDegree(config.key, config.scaleMode, degreeIndex)
}

export function pitchClassLabel(pitchClass: number, key: ScaleRushKey): string {
  const normalized = ((pitchClass % 12) + 12) % 12
  return prefersFlatSpelling(key) ? FLAT_LABELS[normalized]! : SHARP_LABELS[normalized]!
}

/**
 * Single source of truth for the note sequence.
 * HUD target, tile labels, obstacle labels, and pitch check all derive from here.
 */
export function getTargetNoteAtStep(config: ScaleRushConfig, sequenceStep: number): {
  sequenceIndex: number
  pitchClass: number
  noteLabel: string
} {
  const pitchClass = pitchClassForSequenceStep(config, sequenceStep)
  return {
    sequenceIndex: sequenceStep,
    pitchClass,
    noteLabel: pitchClassLabel(pitchClass, config.key),
  }
}

function terrainForRow(rowOffset: number): RowTerrain {
  const mod = rowOffset % 4
  if (mod === 1) return 'road'
  if (mod === 2) return 'river'
  if (mod === 3) return 'grass'
  return 'grass'
}

export function buildCourseRows(
  config: ScaleRushConfig,
  sequenceStep: number,
  visibleAhead = 8,
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

export function concertToWrittenPitchClass(
  concertPitchClass: number,
  transposition: ScaleRushTransposition,
): number {
  const shift = transpositionSemitones(transposition)
  return ((concertPitchClass + shift) % 12 + 12) % 12
}

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
