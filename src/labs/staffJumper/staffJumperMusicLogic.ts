import type { PitchReadout } from '../../utils/pitchUtils'
import type { TunerInstrument } from '../../utils/pitchConfig'
import { getTunerTransposition } from '../../utils/tunerTransposition'
import type { PracticeGameCharacterId } from '../practiceGameCharacters'
import {
  getStaffPositionForNote,
  NOTE_SPACING_PX,
  STAFF_FIRST_NOTE_X,
  STAFF_MIDDLE_Y,
  STAFF_NOTE_LETTERS,
  type StaffJumperClef,
  type StaffNoteLetter,
} from './staffNotationMap'
import {
  getWrittenRange,
  STAFF_CENTER_MIDI,
  type StaffJumperTransposition,
} from './staffJumperInstrumentRanges'
import {
  getRhythmSlot,
  type RhythmSlot,
  type StaffJumperMeter,
} from './staffJumperRhythm'
import { buildExerciseBlock, type PatternStep } from './staffJumperPatterns'

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
  easy: 'Note names shown. Stepwise runs, neighbour tones and rests on the beat.',
  medium: 'Adds triads, broken thirds, turns and rests that split a beat.',
  hard: 'Adds seventh chords, wide intervals and entries after a rest.',
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
  transposition: StaffJumperTransposition
  playerModel: PracticeGameCharacterId
  meter: StaffJumperMeter
  tempoBpm: number
  metronome: boolean
  drone: boolean
  sessionSeed?: number
}

/** How a landed note sat against the beat it was written on. */
export type StaffJumperTiming = 'early' | 'on' | 'late' | null

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
  /** Timing of the most recent landing, and how far off it was in ms. */
  timing: StaffJumperTiming
  timingErrorMs: number
  onTimeCount: number
  /** True while the count-in is still running and pitch is ignored. */
  isCountingIn: boolean
  /**
   * True while an accepted note is being held for its written length.
   *
   * The note has already scored by this point; the run is waiting out its
   * duration before hopping on, so a whole note keeps the player on its
   * platform for four beats instead of moving the instant the pitch is
   * recognised.
   */
  isSustaining: boolean
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
  showLabel: boolean
  /**
   * True when this step is silence rather than a note to play.
   *
   * The pitch fields still describe the note that *follows* the rest, because
   * a rest borrows the pitch stream position it has not consumed. Nothing may
   * judge a player's pitch against them while `isRest` is set.
   */
  isRest: boolean
  /** Rhythm — how the note is written and where it falls in the bar. */
  rhythm: RhythmSlot
  /** World X of the notehead, spaced by duration rather than by index. */
  xPx: number
  /** Exercise shape this note belongs to, e.g. "Triad", "Broken thirds". */
  patternName: string
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

/** The order accidentals are added to a key signature. */
const SHARP_LETTER_ORDER: readonly StaffNoteLetter[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B']
const FLAT_LETTER_ORDER: readonly StaffNoteLetter[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F']

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

/**
 * Which letters the key signature already alters, and how.
 *
 * Keyed by letter rather than pitch class: a signature sharpens the letter F,
 * not "everything that sounds like F♯". Matching on pitch class would wrongly
 * swallow an enharmonic spelling such as a written G♭ in a key that only
 * signs F♯.
 */
function keySignatureAccidentals(
  key: StaffJumperKey,
  scaleMode: StaffJumperScaleMode,
): Map<StaffNoteLetter, '#' | 'b'> {
  const majorKey = signatureMajorKey(key, scaleMode)
  const sharpCount = MAJOR_SHARP_COUNT[majorKey] ?? 0
  const flatCount = MAJOR_FLAT_COUNT[majorKey] ?? 0
  const accidentals = new Map<StaffNoteLetter, '#' | 'b'>()
  for (let index = 0; index < sharpCount; index += 1) {
    accidentals.set(SHARP_LETTER_ORDER[index]!, '#')
  }
  for (let index = 0; index < flatCount; index += 1) {
    accidentals.set(FLAT_LETTER_ORDER[index]!, 'b')
  }
  return accidentals
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

export function showNoteLabels(difficulty: StaffJumperDifficulty): boolean {
  return difficulty === 'easy'
}

/**
 * The key signature is always printed.
 *
 * Every note the game generates is a degree of the chosen scale, so the
 * signature accounts for all of them — which means no note ever needs its own
 * accidental, and the staff stays clean.
 */
export function showKeySignature(): boolean {
  return true
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
  scaleMode: StaffJumperScaleMode,
  degreeIndex: number,
  rootMidi: number,
): number {
  const pattern = scalePattern(scaleMode)
  const octaveOffset = Math.floor(degreeIndex / 7)
  const degreeInOctave = degreeIndex % 7
  const semitoneFromRoot = pattern[degreeInOctave]! + octaveOffset * 12
  return rootMidi + semitoneFromRoot
}

/**
 * Choose the octave the scale is written in.
 *
 * Two competing goals: the whole scale must sit inside what the instrument can
 * actually play, and it should sit as close to the middle of the staff as
 * possible so it stays readable. Fit wins — the weight makes one semitone of
 * range overflow cost more than any amount of off-center placement — and
 * centering only breaks ties between octaves that both fit.
 *
 * This is what keeps a 2-octave Bb trumpet scale on Bb3–Bb5 instead of running
 * up to Bb6 on four ledger lines.
 */
const RANGE_OVERFLOW_WEIGHT = 100

export function resolveScaleRootMidi(
  config: Pick<StaffJumperConfig, 'key' | 'range' | 'clef' | 'transposition' | 'tunerInstrument'>,
): number {
  const rootPitchClass = keyPitchClass(config.key)
  const spanSemitones = (config.range === '1-octave' ? 1 : 2) * 12
  const { minMidi, maxMidi } = getWrittenRange(
    config.transposition,
    config.clef,
    config.tunerInstrument,
  )
  const staffCenter = STAFF_CENTER_MIDI[config.clef]

  let bestRoot = minMidi
  let bestScore = Number.POSITIVE_INFINITY

  // Every octave of the root that could plausibly land on a five-line staff.
  for (let candidate = rootPitchClass + 12; candidate <= 108; candidate += 12) {
    const overflow =
      Math.max(0, minMidi - candidate) + Math.max(0, candidate + spanSemitones - maxMidi)
    const centerError = Math.abs(candidate + spanSemitones / 2 - staffCenter)
    const score = overflow * RANGE_OVERFLOW_WEIGHT + centerError
    if (score < bestScore) {
      bestScore = score
      bestRoot = candidate
    }
  }

  return bestRoot
}

function topDegreeForRange(range: StaffJumperRange): number {
  return range === '1-octave' ? 7 : 14
}

/**
 * A complete scale statement, up and down, that opens every run.
 *
 * It orients the player in the key before the patterns start, and it is the one
 * part of the exercise that is the same every time.
 */
export function buildScaleIntroDegreePath(
  config: Pick<StaffJumperConfig, 'range'>,
): number[] {
  const topDegree = topDegreeForRange(config.range)
  return [
    ...Array.from({ length: topDegree + 1 }, (_, degree) => degree),
    ...Array.from({ length: topDegree }, (_, index) => topDegree - 1 - index),
  ]
}

interface ExerciseCache {
  steps: PatternStep[]
  blockCount: number
}

const exerciseCache = new WeakMap<StaffJumperConfig, ExerciseCache>()

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

function appendExerciseBlock(config: StaffJumperConfig, cache: ExerciseCache): void {
  const previous = cache.steps.at(-1)
  // The very first block follows the opening scale, which always lands on the
  // tonic — so that is what it has to avoid restating.
  const previousDegree = previous?.degree ?? buildScaleIntroDegreePath(config).at(-1) ?? 0
  const block = buildExerciseBlock({
    difficulty: config.difficulty,
    topDegree: topDegreeForRange(config.range),
    rng: mulberry32((config.sessionSeed ?? 1) + cache.blockCount * 7919),
    previousDegree,
    previousPatternId: previous?.patternId ?? null,
  })
  cache.blockCount += 1

  // Never restate the note the player is already standing on.
  while (block.length > 0 && block[0]!.degree === previousDegree) block.shift()
  cache.steps.push(...block)
}

/**
 * Pattern work for one step past the opening scale, generated lazily.
 *
 * Memoized against the config object, which carries the run's `sessionSeed` —
 * a new run means a new object and therefore a new exercise.
 */
function exerciseStepAt(config: StaffJumperConfig, patternIndex: number): PatternStep {
  let cache = exerciseCache.get(config)
  if (!cache) {
    cache = { steps: [], blockCount: 0 }
    exerciseCache.set(config, cache)
  }
  // Blocks can come back empty if a pattern does not fit the range; the counter
  // still advances, so the seed moves on and this cannot spin forever.
  let guard = 0
  while (patternIndex >= cache.steps.length && guard < 64) {
    appendExerciseBlock(config, cache)
    guard += 1
  }
  return cache.steps[patternIndex] ?? { degree: 0, patternId: 'tonic', patternName: 'Tonic' }
}

/** Degree and pattern for a step — the intro scale, then randomized patterns. */
export function exerciseStepForSequenceStep(
  config: StaffJumperConfig,
  sequenceStep: number,
): PatternStep {
  const intro = buildScaleIntroDegreePath(config)
  if (sequenceStep < intro.length) {
    return { degree: intro[sequenceStep]!, patternId: 'scale', patternName: 'Scale' }
  }
  return exerciseStepAt(config, sequenceStep - intro.length)
}

export function degreeForSequenceStep(config: StaffJumperConfig, sequenceStep: number): number {
  return exerciseStepForSequenceStep(config, sequenceStep).degree
}

/**
 * Single source of truth for the note sequence.
 * HUD target, platform label, staff Y, and pitch check all derive from here.
 */
/** Rhythm for one step, keyed off the config object so the stream is stable. */
export function getRhythmForStep(config: StaffJumperConfig, sequenceStep: number): RhythmSlot {
  return getRhythmSlot(
    config,
    config.meter,
    config.difficulty,
    config.sessionSeed ?? 1,
    sequenceStep,
  )
}

/** World X of a notehead, from accumulated duration-based spacing. */
export function noteXForStep(config: StaffJumperConfig, sequenceStep: number): number {
  return STAFF_FIRST_NOTE_X + getRhythmForStep(config, sequenceStep).spacingPosition * NOTE_SPACING_PX
}

export function getTargetNoteAtStep(config: StaffJumperConfig, sequenceStep: number): TargetNote {
  const rhythm = getRhythmForStep(config, sequenceStep)
  // Rests take no pitch, so the exercise is walked by note index rather than by
  // step — silence never costs the player a note of the pattern they are on.
  const exerciseStep = exerciseStepForSequenceStep(config, rhythm.noteIndex)
  const degreeIndex = exerciseStep.degree
  const rootMidi = resolveScaleRootMidi(config)
  const midi = midiForScaleDegree(config.scaleMode, degreeIndex, rootMidi)
  const pitchClass = ((midi % 12) + 12) % 12
  // The root's letter octave — writtenScaleNote walks letters up from here.
  const rootOctave = Math.floor(rootMidi / 12) - 1
  const written = writtenScaleNote(config.key, pitchClass, degreeIndex, rootOctave)
  const staff = getStaffPositionForNote(written.letter, written.octave, config.clef)
  return {
    sequenceIndex: sequenceStep,
    midi,
    pitchClass,
    noteLabel: written.label,
    // A rest is written against the middle line whatever pitch surrounds it.
    yPx: rhythm.isRest ? STAFF_MIDDLE_Y : staff.yPx,
    kind: rhythm.isRest ? 'line' : staff.kind,
    ledgerLineYPx: rhythm.isRest ? [] : staff.ledgerLineYPx,
    writtenLetter: written.letter,
    writtenOctave: written.octave,
    showLabel: showNoteLabels(config.difficulty) && !rhythm.isRest,
    isRest: rhythm.isRest,
    rhythm,
    xPx: STAFF_FIRST_NOTE_X + rhythm.spacingPosition * NOTE_SPACING_PX,
    patternName: exerciseStep.patternName,
  }
}

/** Concert pitch class of the tonic — what the drone should actually sound. */
export function getConcertTonicPitchClass(config: StaffJumperConfig): number {
  const written = keyPitchClass(config.key)
  return ((written - getTunerTransposition(config.transposition).writtenOffsetSemitones) % 12 + 12) % 12
}

export interface ScaleRangePreview {
  /** Written lowest and highest note, e.g. "B♭3" and "B♭5". */
  lowLabel: string
  highLabel: string
  /** Notes in one full up-and-down lap of the scale. */
  noteCount: number
  /** "2 flats", "no sharps or flats", etc. */
  signatureLabel: string
}

const ACCIDENTAL_GLYPHS: Record<string, string> = { '#': '♯', b: '♭' }

function prettyNoteLabel(letter: StaffNoteLetter, accidental: '#' | 'b' | null, octave: number): string {
  return `${letter}${accidental ? ACCIDENTAL_GLYPHS[accidental] : ''}${octave}`
}

/**
 * What the player is about to read, resolved through the same range logic the
 * game itself uses. Surfacing it on the setup screen makes the octave choice
 * checkable at a glance instead of a surprise on the first note.
 */
export function getScaleRangePreview(config: StaffJumperConfig): ScaleRangePreview {
  const topDegree = topDegreeForRange(config.range)
  const rootMidi = resolveScaleRootMidi(config)
  const rootOctave = Math.floor(rootMidi / 12) - 1

  const noteAt = (degreeIndex: number) => {
    const midi = midiForScaleDegree(config.scaleMode, degreeIndex, rootMidi)
    const pitchClass = ((midi % 12) + 12) % 12
    const written = writtenScaleNote(config.key, pitchClass, degreeIndex, rootOctave)
    return prettyNoteLabel(written.letter, written.accidental, written.octave)
  }

  const accidentals = keySignatureAccidentals(config.key, config.scaleMode)
  const count = accidentals.size
  const symbol = accidentals.values().next().value
  const signatureLabel =
    count === 0
      ? 'no sharps or flats'
      : `${count} ${symbol === '#' ? 'sharp' : 'flat'}${count === 1 ? '' : 's'}`

  return {
    lowLabel: noteAt(0),
    highLabel: noteAt(topDegree),
    noteCount: buildScaleIntroDegreePath(config).length,
    signatureLabel,
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
    const opacity = role === 'target' ? 1 : role === 'landed' ? 1 : Math.max(0.4, 1 - distance * 0.11)

    slots.push({ step, note, role, opacity, xPx: note.xPx })
  }

  return slots
}

export function pitchClassesMatch(detected: number, target: number): boolean {
  return ((detected % 12) + 12) % 12 === ((target % 12) + 12) % 12
}

/**
 * Widest band any supported profile can report — tuba/bass low E1 up through
 * a flute's top register. Narrower gates here silently dropped notes that the
 * tuner itself was tracking fine.
 */
const MIN_GAMEPLAY_HZ = 55
const MAX_GAMEPLAY_HZ = 1760

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
  const writtenOffset = config
    ? getTunerTransposition(config.transposition).writtenOffsetSemitones
    : 0
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
