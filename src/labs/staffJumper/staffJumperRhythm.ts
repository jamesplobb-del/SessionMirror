/**
 * Rhythm for Staff Jumper.
 *
 * The pitch stream and the rhythm stream are generated independently and zipped
 * together by note index: note N takes the Nth pitch and the Nth duration. That
 * keeps the existing scale/interval logic untouched and lets the rhythm be
 * changed without disturbing which notes come out.
 *
 * Everything is measured in beats where a quarter note is 1.
 */

export const STAFF_JUMPER_RHYTHMS = ['auto', 'straight', 'mixed', 'dotted'] as const
export type StaffJumperRhythm = (typeof STAFF_JUMPER_RHYTHMS)[number]

/** A concrete rhythm style, once `auto` has been resolved against difficulty. */
export type ResolvedRhythm = Exclude<StaffJumperRhythm, 'auto'>

export const RHYTHM_LABELS: Record<StaffJumperRhythm, string> = {
  auto: 'Auto',
  straight: 'Straight',
  mixed: 'Mixed',
  dotted: 'Dotted',
}

export const RHYTHM_DESCRIPTIONS: Record<StaffJumperRhythm, string> = {
  auto: 'Follows the difficulty you picked.',
  straight: 'Quarter notes only — one note per beat.',
  mixed: 'Quarters, halves and eighth-note pairs.',
  dotted: 'Adds dotted rhythms and longer held notes.',
}

/** Beats in one bar. Staff Jumper writes everything in 4/4. */
export const BEATS_PER_BAR = 4

export const TIME_SIGNATURE = { beats: 4, beatValue: 4 } as const

export type NoteValue = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth'

export interface RhythmValue {
  value: NoteValue
  dotted: boolean
  /** Duration in quarter-note beats, dot included. */
  beats: number
}

const UNDOTTED_BEATS: Record<NoteValue, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  sixteenth: 0.25,
}

function make(value: NoteValue, dotted = false): RhythmValue {
  const beats = UNDOTTED_BEATS[value] * (dotted ? 1.5 : 1)
  return { value, dotted, beats }
}

const WHOLE = make('whole')
const DOTTED_HALF = make('half', true)
const HALF = make('half')
const DOTTED_QUARTER = make('quarter', true)
const QUARTER = make('quarter')
const EIGHTH = make('eighth')

/**
 * Bar-length rhythm cells. Every entry sums to exactly {@link BEATS_PER_BAR},
 * so bars always line up and barlines land where they should.
 */
const STRAIGHT_BARS: readonly RhythmValue[][] = [[QUARTER, QUARTER, QUARTER, QUARTER]]

const MIXED_BARS: readonly RhythmValue[][] = [
  [QUARTER, QUARTER, QUARTER, QUARTER],
  [HALF, QUARTER, QUARTER],
  [QUARTER, QUARTER, HALF],
  [EIGHTH, EIGHTH, QUARTER, QUARTER, QUARTER],
  [QUARTER, EIGHTH, EIGHTH, HALF],
  [HALF, HALF],
  [QUARTER, QUARTER, EIGHTH, EIGHTH, QUARTER],
  [EIGHTH, EIGHTH, EIGHTH, EIGHTH, HALF],
]

const DOTTED_BARS: readonly RhythmValue[][] = [
  ...MIXED_BARS,
  [DOTTED_QUARTER, EIGHTH, QUARTER, QUARTER],
  [QUARTER, QUARTER, DOTTED_QUARTER, EIGHTH],
  [DOTTED_HALF, QUARTER],
  [QUARTER, DOTTED_HALF],
  [DOTTED_QUARTER, EIGHTH, HALF],
  [WHOLE],
]

const BARS_BY_RHYTHM: Record<ResolvedRhythm, readonly RhythmValue[][]> = {
  straight: STRAIGHT_BARS,
  mixed: MIXED_BARS,
  dotted: DOTTED_BARS,
}

/**
 * `auto` maps difficulty onto a rhythm so the setting can be left alone, while
 * an explicit choice always wins.
 */
export function resolveRhythm(
  rhythm: StaffJumperRhythm,
  difficulty: 'easy' | 'medium' | 'hard',
): ResolvedRhythm {
  if (rhythm !== 'auto') return rhythm
  if (difficulty === 'easy') return 'straight'
  if (difficulty === 'medium') return 'mixed'
  return 'dotted'
}

/**
 * Horizontal width a note earns, relative to a quarter note.
 *
 * Engravers do not space notes in direct proportion to duration — a whole note
 * gets more room than a quarter but nowhere near four times as much. The
 * exponent compresses the range the way engraved music looks, and as a side
 * effect eighth notes pack tightly enough to fit more of the line on screen.
 */
export function spacingUnitsForBeats(beats: number): number {
  return Math.pow(Math.max(beats, 0.0625), 0.62)
}

export interface RhythmSlot {
  index: number
  value: NoteValue
  dotted: boolean
  beats: number
  /** Cumulative beats from the start of the run. */
  beatPosition: number
  barIndex: number
  beatInBar: number
  startsBar: boolean
  /** Cumulative spacing units from the start of the run. */
  spacingPosition: number
  /** Notes beamed together share an id; null when the note stands alone. */
  beamGroupId: number | null
  beamIndexInGroup: number
  beamGroupSize: number
}

interface RhythmTimeline {
  slots: RhythmSlot[]
  barCount: number
  beatCursor: number
  spacingCursor: number
  beamCursor: number
}

/** Extra breathing room at a barline, in spacing units. */
export const BARLINE_SPACING_UNITS = 0.55

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

/**
 * Beam runs of short notes that sit inside the same beat.
 *
 * Standard practice in 4/4: eighths beam in pairs per quarter-note beat rather
 * than across the whole bar, which keeps the beat visible when reading.
 */
function assignBeams(slots: RhythmSlot[], fromIndex: number, timeline: RhythmTimeline): void {
  let runStart = fromIndex
  while (runStart < slots.length) {
    const slot = slots[runStart]!
    if (slot.beats >= 1) {
      runStart += 1
      continue
    }

    const beatOfRun = Math.floor(slot.beatPosition)
    let runEnd = runStart
    while (
      runEnd + 1 < slots.length &&
      slots[runEnd + 1]!.beats < 1 &&
      Math.floor(slots[runEnd + 1]!.beatPosition) === beatOfRun
    ) {
      runEnd += 1
    }

    const size = runEnd - runStart + 1
    if (size >= 2) {
      const groupId = timeline.beamCursor
      timeline.beamCursor += 1
      for (let i = runStart; i <= runEnd; i += 1) {
        slots[i]!.beamGroupId = groupId
        slots[i]!.beamIndexInGroup = i - runStart
        slots[i]!.beamGroupSize = size
      }
    }

    runStart = runEnd + 1
  }
}

function appendBar(timeline: RhythmTimeline, rhythm: ResolvedRhythm, seed: number): void {
  const bars = BARS_BY_RHYTHM[rhythm]
  const rng = mulberry32(seed + timeline.barCount * 2654435761)
  const bar = bars[Math.floor(rng() * bars.length)]!
  const firstNewIndex = timeline.slots.length

  bar.forEach((rhythmValue, indexInBar) => {
    const beatInBar = timeline.beatCursor % BEATS_PER_BAR
    timeline.slots.push({
      index: timeline.slots.length,
      value: rhythmValue.value,
      dotted: rhythmValue.dotted,
      beats: rhythmValue.beats,
      beatPosition: timeline.beatCursor,
      barIndex: timeline.barCount,
      beatInBar,
      startsBar: indexInBar === 0,
      spacingPosition: timeline.spacingCursor + (indexInBar === 0 ? BARLINE_SPACING_UNITS : 0),
      beamGroupId: null,
      beamIndexInGroup: 0,
      beamGroupSize: 1,
    })
    timeline.beatCursor += rhythmValue.beats
    timeline.spacingCursor +=
      spacingUnitsForBeats(rhythmValue.beats) + (indexInBar === 0 ? BARLINE_SPACING_UNITS : 0)
  })

  timeline.barCount += 1
  assignBeams(timeline.slots, firstNewIndex, timeline)
}

const timelineCache = new WeakMap<object, RhythmTimeline>()

/**
 * Rhythm for one note index, generated lazily and memoized against the config
 * object so repeated reads during a render are free and stay consistent.
 */
export function getRhythmSlot(
  configKey: object,
  rhythm: ResolvedRhythm,
  seed: number,
  index: number,
): RhythmSlot {
  let timeline = timelineCache.get(configKey)
  if (!timeline) {
    timeline = { slots: [], barCount: 0, beatCursor: 0, spacingCursor: 0, beamCursor: 0 }
    timelineCache.set(configKey, timeline)
  }
  while (index >= timeline.slots.length) appendBar(timeline, rhythm, seed)
  return timeline.slots[index]!
}

/** True for note values that need a flag or beam. */
export function isBeamable(value: NoteValue): boolean {
  return value === 'eighth' || value === 'sixteenth'
}

/** Half and whole notes are drawn as rings rather than filled ovals. */
export function isHollowNotehead(value: NoteValue): boolean {
  return value === 'whole' || value === 'half'
}

export function hasStem(value: NoteValue): boolean {
  return value !== 'whole'
}

export function beamCountForValue(value: NoteValue): number {
  if (value === 'sixteenth') return 2
  if (value === 'eighth') return 1
  return 0
}

export function secondsPerBeat(bpm: number): number {
  return 60 / Math.max(1, bpm)
}

export const STAFF_JUMPER_TEMPO_MIN = 40
export const STAFF_JUMPER_TEMPO_MAX = 200
export const STAFF_JUMPER_TEMPO_DEFAULT = 80

/**
 * Half-width of the "on the beat" window as a fraction of a beat, clamped so it
 * stays humane at fast tempos and does not become a free pass at slow ones.
 */
const ON_BEAT_WINDOW_FRACTION = 0.18
const ON_BEAT_WINDOW_MIN_MS = 90
const ON_BEAT_WINDOW_MAX_MS = 220

export function onBeatWindowMs(bpm: number): number {
  const beatMs = secondsPerBeat(bpm) * 1000
  return Math.max(
    ON_BEAT_WINDOW_MIN_MS,
    Math.min(ON_BEAT_WINDOW_MAX_MS, beatMs * ON_BEAT_WINDOW_FRACTION),
  )
}

export type NotePlacement = 'early' | 'on' | 'late'

export interface TimingVerdict {
  placement: NotePlacement
  errorMs: number
  /** Beat position the *next* note is expected on. */
  nextExpectedBeat: number
}

/**
 * Judge one landing against the beat it was written on.
 *
 * `nextExpectedBeat` is re-anchored to where the player actually landed plus
 * the note they just held, rather than to a fixed grid. Two reasons: one slow
 * note would otherwise mark every note after it late for the rest of the run,
 * and pitch detection adds a roughly constant lag that cancels out when
 * successive notes are compared to each other.
 */
export function judgeTiming(
  actualBeat: number,
  expectedBeat: number,
  heldNoteBeats: number,
  bpm: number,
): TimingVerdict {
  const errorMs = (actualBeat - expectedBeat) * secondsPerBeat(bpm) * 1000
  const window = onBeatWindowMs(bpm)
  return {
    placement: Math.abs(errorMs) <= window ? 'on' : errorMs < 0 ? 'early' : 'late',
    errorMs,
    nextExpectedBeat: actualBeat + heldNoteBeats,
  }
}
