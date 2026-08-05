import type { PitchReadout } from '../../utils/pitchUtils'
import type { TunerInstrument } from '../../utils/pitchConfig'
import {
  transpositionSemitones,
  type ScaleRushTransposition,
} from '../scaleRush/scaleRushMusicLogic'
import type { ScaleRushPlayerModelId } from '../scaleRush/scaleRushTypes'
import {
  getStaffPositionForNote,
  NOTE_SPACING_PX,
  STAFF_FIRST_NOTE_X,
  STAFF_NOTE_LETTERS,
  type StaffJumperClef,
  type StaffNoteLetter,
} from './staffNotationMap'

export const STAFF_JUMPER_MAJOR_KEYS = [
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

export const STAFF_JUMPER_MINOR_KEYS = [
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

export type StaffJumperMajorKey = (typeof STAFF_JUMPER_MAJOR_KEYS)[number]
export type StaffJumperMinorKey = (typeof STAFF_JUMPER_MINOR_KEYS)[number]
export type StaffJumperKey = StaffJumperMajorKey | StaffJumperMinorKey

export type StaffJumperScaleMode = 'major' | 'minor'

export const STAFF_JUMPER_RANGES = ['1-octave', '2-octaves'] as const
export type StaffJumperRange = (typeof STAFF_JUMPER_RANGES)[number]

export const SCALE_MODE_LABELS: Record<StaffJumperScaleMode, string> = {
  major: 'Major',
  minor: 'Natural Minor',
}

export const RANGE_LABELS: Record<StaffJumperRange, string> = {
  '1-octave': '1 Octave',
  '2-octaves': '2 Octaves',
}

export const STAFF_JUMPER_BEST_SCORE_KEY = 'sessionmirror:staff-jumper-best'

export const STAFF_JUMPER_DIFFICULTIES = ['easy', 'medium', 'hard'] as const
export type StaffJumperDifficulty = (typeof STAFF_JUMPER_DIFFICULTIES)[number]

export const DIFFICULTY_LABELS: Record<StaffJumperDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

export const DIFFICULTY_DESCRIPTIONS: Record<StaffJumperDifficulty, string> = {
  easy: 'Note names are shown and the scale repeats.',
  medium: 'Starts with the scale, then moves through interval patterns.',
  hard: 'Starts with the scale, then adds leaps, arpeggios, and key signatures.',
}

export const DIFFICULTY_TIMEOUT_SECONDS: Record<StaffJumperDifficulty, number> = {
  easy: 15,
  medium: 12,
  hard: 9,
}

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

export type StaffJumperPhase = 'setup' | 'playing' | 'paused' | 'gameover'

export type StaffJumperFeedback = 'perfect' | 'good' | 'wrong' | 'timeout' | null

export interface StaffJumperConfig {
  key: StaffJumperKey
  scaleMode: StaffJumperScaleMode
  range: StaffJumperRange
  difficulty: StaffJumperDifficulty
  clef: StaffJumperClef
  tunerInstrument: TunerInstrument
  transposition: ScaleRushTransposition
  playerModel: ScaleRushPlayerModelId
  sessionSeed?: number
}

export interface StaffJumperState {
  phase: StaffJumperPhase
  config: StaffJumperConfig | null
  sequenceStep: number
  targetPitchClass: number
  score: number
  streak: number
  bestStreak: number
  hearts: number
  correctCount: number
  missCount: number
  bestScore: number
  advanceToken: number
  missToken: number
  feedback: StaffJumperFeedback
  feedbackToken: number
  isFalling: boolean
  startedAtMs: number | null
  endedAtMs: number | null
  pausedAtMs: number | null
  pausedDurationMs: number
}

export interface TargetNote {
  sequenceIndex: number
  midi: number
  pitchClass: number
  noteLabel: string
  yPx: number
  kind: 'ledger' | 'space' | 'line'
  ledgerLineYPx: number[]
  writtenLetter: StaffNoteLetter
  writtenOctave: number
  accidental: '#' | 'b' | null
  showLabel: boolean
}

export interface KeySignatureMarker {
  symbol: '#' | 'b'
  yPx: number
}

const SIGNATURE_POSITIONS: Record<
  StaffJumperClef,
  { sharps: readonly [StaffNoteLetter, number][]; flats: readonly [StaffNoteLetter, number][] }
> = {
  treble: {
    /** F C G D A E B */
    sharps: [['F', 5], ['C', 5], ['G', 5], ['D', 5], ['A', 4], ['E', 5], ['B', 4]],
    /** B E A D G C F */
    flats: [['B', 4], ['E', 5], ['A', 4], ['D', 5], ['G', 4], ['C', 5], ['F', 4]],
  },
  bass: {
    /** F C G D A E B */
    sharps: [['F', 3], ['C', 3], ['G', 3], ['D', 3], ['A', 3], ['E', 3], ['B', 3]],
    /** B E A D G C F */
    flats: [['B', 2], ['E', 3], ['A', 2], ['D', 3], ['G', 2], ['C', 3], ['F', 2]],
  },
}

const MAJOR_SHARP_COUNT: Partial<Record<StaffJumperMajorKey, number>> = {
  C: 0,
  G: 1,
  D: 2,
  A: 3,
  E: 4,
  B: 5,
}

const MAJOR_FLAT_COUNT: Partial<Record<StaffJumperMajorKey, number>> = {
  C: 0,
  F: 1,
  Bb: 2,
  Eb: 3,
  Ab: 4,
  Db: 5,
  Gb: 6,
}

/** Resulting pitch classes after each signature accidental is applied. */
const SHARP_PCS = [6, 1, 8, 3, 10, 5, 0] as const
const FLAT_PCS = [10, 3, 8, 1, 6, 11, 4] as const

function signatureMajorKey(key: StaffJumperKey, scaleMode: StaffJumperScaleMode): StaffJumperMajorKey {
  if (scaleMode === 'major') return key as StaffJumperMajorKey
  const minorPc = keyPitchClass(key)
  const majorPc = (minorPc + 3) % 12
  const majorByPc: Record<number, StaffJumperMajorKey> = {
    0: 'C',
    1: 'Db',
    2: 'D',
    3: 'Eb',
    4: 'E',
    5: 'F',
    6: 'Gb',
    7: 'G',
    8: 'Ab',
    9: 'A',
    10: 'Bb',
    11: 'B',
  }
  return majorByPc[majorPc] ?? 'C'
}

function keySignaturePitchClasses(key: StaffJumperKey, scaleMode: StaffJumperScaleMode): Set<number> {
  const majorKey = signatureMajorKey(key, scaleMode)
  const sharpCount = MAJOR_SHARP_COUNT[majorKey] ?? 0
  const flatCount = MAJOR_FLAT_COUNT[majorKey] ?? 0
  const pcs = new Set<number>()
  if (sharpCount > 0) {
    for (let index = 0; index < sharpCount; index += 1) {
      pcs.add(SHARP_PCS[index]!)
    }
  } else if (flatCount > 0) {
    for (let index = 0; index < flatCount; index += 1) {
      pcs.add(FLAT_PCS[index]!)
    }
  }
  return pcs
}

export function getKeySignatureMarkers(
  key: StaffJumperKey,
  scaleMode: StaffJumperScaleMode,
  clef: StaffJumperClef = 'treble',
): KeySignatureMarker[] {
  const majorKey = signatureMajorKey(key, scaleMode)
  const sharpCount = MAJOR_SHARP_COUNT[majorKey] ?? 0
  const flatCount = MAJOR_FLAT_COUNT[majorKey] ?? 0
  if (sharpCount > 0) {
    return Array.from({ length: sharpCount }, (_, index) => ({
      symbol: '#' as const,
      yPx: getStaffPositionForNote(...SIGNATURE_POSITIONS[clef].sharps[index]!, clef).yPx,
    }))
  }
  if (flatCount > 0) {
    return Array.from({ length: flatCount }, (_, index) => ({
      symbol: 'b' as const,
      yPx: getStaffPositionForNote(...SIGNATURE_POSITIONS[clef].flats[index]!, clef).yPx,
    }))
  }
  return []
}

function accidentalForNote(
  pitchClass: number,
  writtenAccidental: '#' | 'b' | null,
  key: StaffJumperKey,
  scaleMode: StaffJumperScaleMode,
  difficulty: StaffJumperDifficulty,
): '#' | 'b' | null {
  if (writtenAccidental == null) return null
  const normalized = ((pitchClass % 12) + 12) % 12
  if (difficulty === 'hard' && keySignaturePitchClasses(key, scaleMode).has(normalized)) {
    return null
  }
  return writtenAccidental
}

export function showNoteLabels(difficulty: StaffJumperDifficulty): boolean {
  return difficulty === 'easy'
}

export function showKeySignature(difficulty: StaffJumperDifficulty): boolean {
  return difficulty === 'hard'
}

export function keysForScaleMode(scaleMode: StaffJumperScaleMode): readonly StaffJumperKey[] {
  return scaleMode === 'major' ? STAFF_JUMPER_MAJOR_KEYS : STAFF_JUMPER_MINOR_KEYS
}

export function scaleDisplayName(key: StaffJumperKey, scaleMode: StaffJumperScaleMode): string {
  return `${key} ${SCALE_MODE_LABELS[scaleMode]}`
}

function prefersFlatSpelling(key: StaffJumperKey): boolean {
  return key.includes('b') || key === 'F' || key === 'Db' || key === 'Gb' || key === 'Ab' || key === 'Eb'
}

function keyPitchClass(key: StaffJumperKey): number {
  return KEY_TO_PITCH_CLASS[key] ?? 0
}

function scalePattern(scaleMode: StaffJumperScaleMode): readonly number[] {
  return scaleMode === 'major' ? MAJOR_PATTERN : MINOR_PATTERN
}

const NATURAL_PITCH_CLASS: Record<StaffNoteLetter, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}

interface WrittenScaleNote {
  letter: StaffNoteLetter
  octave: number
  accidental: '#' | 'b' | null
  label: string
}

function writtenScaleNote(
  key: StaffJumperKey,
  pitchClass: number,
  degreeIndex: number,
  rootOctave = 4,
): WrittenScaleNote {
  const rootLetter = key[0] as StaffNoteLetter
  const rootLetterIndex = STAFF_NOTE_LETTERS.indexOf(rootLetter)
  const absoluteLetterIndex = rootLetterIndex + degreeIndex
  const letter = STAFF_NOTE_LETTERS[((absoluteLetterIndex % 7) + 7) % 7]!
  const octave = rootOctave + Math.floor(absoluteLetterIndex / 7)
  const naturalPitchClass = NATURAL_PITCH_CLASS[letter]
  const accidentalOffset = ((pitchClass - naturalPitchClass) % 12 + 12) % 12
  const accidental = accidentalOffset === 1 ? '#' : accidentalOffset === 11 ? 'b' : null

  return {
    letter,
    octave,
    accidental,
    label: `${letter}${accidental ?? ''}`,
  }
}

export function pitchClassLabel(pitchClass: number, key: StaffJumperKey): string {
  const normalized = ((pitchClass % 12) + 12) % 12
  return prefersFlatSpelling(key) ? FLAT_LABELS[normalized]! : SHARP_LABELS[normalized]!
}

function midiForScaleDegree(
  key: StaffJumperKey,
  scaleMode: StaffJumperScaleMode,
  degreeIndex: number,
  baseOctave: number,
): number {
  const pattern = scalePattern(scaleMode)
  const rootPc = keyPitchClass(key)
  const octaveOffset = Math.floor(degreeIndex / 7)
  const degreeInOctave = degreeIndex % 7
  const semitoneFromRoot = pattern[degreeInOctave]! + octaveOffset * 12
  const rootMidi = (baseOctave + 1) * 12 + rootPc
  return rootMidi + semitoneFromRoot
}

function topDegreeForRange(range: StaffJumperRange): number {
  return range === '1-octave' ? 7 : 14
}

/** A repeating up-and-down scale with no duplicated turn-around notes. */
export function buildRepeatingScaleDegreePath(
  config: Pick<StaffJumperConfig, 'range'>,
): number[] {
  const topDegree = topDegreeForRange(config.range)
  const ascending = Array.from({ length: topDegree + 1 }, (_, degree) => degree)
  const descending = Array.from({ length: Math.max(0, topDegree - 1) }, (_, index) => topDegree - 1 - index)
  return [...ascending, ...descending]
}

/** A complete scale statement used before medium and hard pattern work. */
export function buildScaleIntroDegreePath(
  config: Pick<StaffJumperConfig, 'range'>,
): number[] {
  const topDegree = topDegreeForRange(config.range)
  return [
    ...Array.from({ length: topDegree + 1 }, (_, degree) => degree),
    ...Array.from({ length: topDegree }, (_, index) => topDegree - 1 - index),
  ]
}

interface DegreePatternCache {
  notes: number[]
  blockCount: number
}

const degreePatternCache = new WeakMap<StaffJumperConfig, DegreePatternCache>()

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function appendDifficultyPattern(config: StaffJumperConfig, cache: DegreePatternCache): void {
  const topDegree = topDegreeForRange(config.range)
  const rng = mulberry32((config.sessionSeed ?? 1) + cache.blockCount * 7919)
  let block: number[]

  if (config.difficulty === 'medium') {
    const start = Math.floor(rng() * Math.max(1, topDegree - 3))
    const templates = [
      [start, start + 2, start + 1, start + 3],
      [start, start + 1, start + 2, start + 1],
      [start + 3, start + 1, start + 2, start],
    ]
    block = [...templates[Math.floor(rng() * templates.length)]!]
  } else {
    const start = Math.floor(rng() * Math.max(1, topDegree - 4))
    const templates = [
      [start, start + 2, start + 4, start + 2],
      [start, start + 3, start + 1, start + 4],
      [start + 4, start + 1, start + 3, start],
    ]
    block = [...templates[Math.floor(rng() * templates.length)]!]
    if (rng() > 0.55) {
      block.push(Math.floor(rng() * (topDegree + 1)))
    }
  }

  block = block.map((degree) => Math.max(0, Math.min(topDegree, degree)))
  const previousDegree = cache.notes.at(-1) ?? 0
  while (block.length > 0 && block[0] === previousDegree) block.shift()
  cache.notes.push(...block)
  cache.blockCount += 1
}

function patternDegreeAt(config: StaffJumperConfig, patternIndex: number): number {
  let cache = degreePatternCache.get(config)
  if (!cache) {
    cache = { notes: [], blockCount: 0 }
    degreePatternCache.set(config, cache)
  }
  while (patternIndex >= cache.notes.length) appendDifficultyPattern(config, cache)
  return cache.notes[patternIndex]!
}

export function degreeForSequenceStep(config: StaffJumperConfig, sequenceStep: number): number {
  if (config.difficulty === 'easy') {
    const path = buildRepeatingScaleDegreePath(config)
    return path[sequenceStep % path.length]!
  }

  const intro = buildScaleIntroDegreePath(config)
  if (sequenceStep < intro.length) return intro[sequenceStep]!
  return patternDegreeAt(config, sequenceStep - intro.length)
}

/**
 * Single source of truth for the note sequence.
 * HUD target, platform label, staff Y, and pitch check all derive from here.
 */
export function getTargetNoteAtStep(config: StaffJumperConfig, sequenceStep: number): TargetNote {
  const degreeIndex = degreeForSequenceStep(config, sequenceStep)
  const baseOctave = config.clef === 'bass' ? 2 : 4
  const midi = midiForScaleDegree(config.key, config.scaleMode, degreeIndex, baseOctave)
  const pitchClass = ((midi % 12) + 12) % 12
  const written = writtenScaleNote(config.key, pitchClass, degreeIndex, baseOctave)
  const staff = getStaffPositionForNote(written.letter, written.octave, config.clef)
  return {
    sequenceIndex: sequenceStep,
    midi,
    pitchClass,
    noteLabel: written.label,
    yPx: staff.yPx,
    kind: staff.kind,
    ledgerLineYPx: staff.ledgerLineYPx,
    writtenLetter: written.letter,
    writtenOctave: written.octave,
    accidental: accidentalForNote(
      pitchClass,
      written.accidental,
      config.key,
      config.scaleMode,
      config.difficulty,
    ),
    showLabel: showNoteLabels(config.difficulty),
  }
}

export interface PlatformSlot {
  step: number
  note: TargetNote
  role: 'landed' | 'target' | 'future'
  opacity: number
  xPx: number
}

export function getVisiblePlatforms(
  config: StaffJumperConfig,
  sequenceStep: number,
  visibleCount = 6,
): PlatformSlot[] {
  const slots: PlatformSlot[] = []
  const hasLanded = sequenceStep > 0
  const focusStep = hasLanded ? sequenceStep - 1 : 0

  for (let index = 0; index < visibleCount; index += 1) {
    const step = focusStep + index
    const note = getTargetNoteAtStep(config, step)

    let role: PlatformSlot['role']
    if (!hasLanded) {
      role = index === 0 ? 'target' : 'future'
    } else if (index === 0) {
      role = 'landed'
    } else if (index === 1) {
      role = 'target'
    } else {
      role = 'future'
    }

    const distance = role === 'target' || role === 'landed' ? 0 : index - (hasLanded ? 1 : 0)
    const opacity = role === 'target' ? 1 : role === 'landed' ? 1 : Math.max(0.4, 1 - distance * 0.15)
    const xPx = STAFF_FIRST_NOTE_X + step * NOTE_SPACING_PX

    slots.push({ step, note, role, opacity, xPx })
  }

  return slots
}

export function pitchClassesMatch(detected: number, target: number): boolean {
  return ((detected % 12) + 12) % 12 === ((target % 12) + 12) % 12
}

const MIN_GAMEPLAY_HZ = 70
const MAX_GAMEPLAY_HZ = 1400

export function readoutToConcertPitchClass(readout: PitchReadout): number | null {
  if (!Number.isFinite(readout.frequencyHz) || readout.frequencyHz < MIN_GAMEPLAY_HZ) return null
  if (readout.frequencyHz > MAX_GAMEPLAY_HZ) return null
  if (!readout.noteName || readout.noteName === '—') return null
  return ((Math.round(readout.midi) % 12) + 12) % 12
}

export function getDetectedPitchClass(
  readout: PitchReadout,
  config?: Pick<StaffJumperConfig, 'transposition'>,
): number | null {
  const concertPitchClass = readoutToConcertPitchClass(readout)
  if (concertPitchClass == null) return null
  const writtenOffset = config ? transpositionSemitones(config.transposition) : 0
  return ((concertPitchClass + writtenOffset) % 12 + 12) % 12
}

export function isReadoutCorrectPitch(
  readout: PitchReadout,
  targetPitchClass: number,
  config: Pick<StaffJumperConfig, 'difficulty' | 'transposition'>,
): boolean {
  const detected = getDetectedPitchClass(readout, config)
  if (detected == null) return false
  if (!pitchClassesMatch(detected, targetPitchClass)) return false
  return config.difficulty !== 'hard' || Math.abs(readout.cents) <= 20
}

export function isReadoutWrongPitch(
  readout: PitchReadout,
  targetPitchClass: number,
  config: Pick<StaffJumperConfig, 'difficulty' | 'transposition'>,
): boolean {
  const detected = getDetectedPitchClass(readout, config)
  if (detected == null) return false
  return !pitchClassesMatch(detected, targetPitchClass)
}

export function loadBestScore(): number {
  try {
    const raw = localStorage.getItem(STAFF_JUMPER_BEST_SCORE_KEY)
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
    localStorage.setItem(STAFF_JUMPER_BEST_SCORE_KEY, String(next))
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
