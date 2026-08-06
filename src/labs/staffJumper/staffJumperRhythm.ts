/**
 * Rhythm for Staff Jumper.
 *
 * The pitch stream and the rhythm stream are generated independently and zipped
 * together by note index: note N takes the Nth pitch and the Nth duration. That
 * keeps the scale and pattern logic untouched and lets the meter change without
 * disturbing which notes come out.
 *
 * Two units are in play and it matters which is which:
 *   • **beats** — quarter-note units. Every duration and bar length is measured
 *     in these, because a quarter note is a quarter note in any meter.
 *   • **pulses** — what the metronome clicks and what the tempo dial means. In
 *     4/4 a pulse is a quarter; in 6/8 it is a dotted quarter.
 */

export const STAFF_JUMPER_METERS = ['simple', 'compound'] as const
export type StaffJumperMeter = (typeof STAFF_JUMPER_METERS)[number]

export interface MeterSpec {
  id: StaffJumperMeter
  /** Printed time signature. */
  numerator: number
  denominator: number
  label: string
  name: string
  description: string
  /** Bar length in quarter-note units. */
  barBeats: number
  /** Quarter-note units in one pulse — what the tempo dial counts. */
  pulseBeats: number
  pulsesPerBar: number
}

export const METERS: Record<StaffJumperMeter, MeterSpec> = {
  simple: {
    id: 'simple',
    numerator: 4,
    denominator: 4,
    label: '4/4',
    name: 'Simple',
    description: 'Four quarter-note beats in a bar.',
    barBeats: 4,
    pulseBeats: 1,
    pulsesPerBar: 4,
  },
  compound: {
    id: 'compound',
    numerator: 6,
    denominator: 8,
    label: '6/8',
    name: 'Compound',
    description: 'Two dotted-quarter beats, each split into three.',
    // Six eighths = three quarter-note units.
    barBeats: 3,
    pulseBeats: 1.5,
    pulsesPerBar: 2,
  },
}

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
  return { value, dotted, beats: UNDOTTED_BEATS[value] * (dotted ? 1.5 : 1) }
}

const WHOLE = make('whole')
const DOTTED_HALF = make('half', true)
const HALF = make('half')
const DOTTED_QUARTER = make('quarter', true)
const QUARTER = make('quarter')
const EIGHTH = make('eighth')

/**
 * Bar-length rhythm cells. Every entry sums to exactly the meter's `barBeats`,
 * so bars always line up and barlines land where they should.
 */
const SIMPLE_BARS: readonly RhythmValue[][] = [
  [QUARTER, QUARTER, QUARTER, QUARTER],
  [HALF, QUARTER, QUARTER],
  [QUARTER, QUARTER, HALF],
  [EIGHTH, EIGHTH, QUARTER, QUARTER, QUARTER],
  [QUARTER, EIGHTH, EIGHTH, HALF],
  [HALF, HALF],
  [QUARTER, QUARTER, EIGHTH, EIGHTH, QUARTER],
  [EIGHTH, EIGHTH, EIGHTH, EIGHTH, HALF],
  [DOTTED_QUARTER, EIGHTH, QUARTER, QUARTER],
  [QUARTER, QUARTER, DOTTED_QUARTER, EIGHTH],
  [DOTTED_HALF, QUARTER],
  [QUARTER, DOTTED_HALF],
  [WHOLE],
]

/** 6/8 cells. Each dotted-quarter pulse is filled in one of the usual ways. */
const COMPOUND_BARS: readonly RhythmValue[][] = [
  [DOTTED_QUARTER, DOTTED_QUARTER],
  [EIGHTH, EIGHTH, EIGHTH, EIGHTH, EIGHTH, EIGHTH],
  [DOTTED_QUARTER, EIGHTH, EIGHTH, EIGHTH],
  [EIGHTH, EIGHTH, EIGHTH, DOTTED_QUARTER],
  // The 6/8 lilt: long-short, long-short.
  [QUARTER, EIGHTH, QUARTER, EIGHTH],
  [QUARTER, EIGHTH, DOTTED_QUARTER],
  [DOTTED_QUARTER, QUARTER, EIGHTH],
  [EIGHTH, EIGHTH, EIGHTH, QUARTER, EIGHTH],
  [QUARTER, EIGHTH, EIGHTH, EIGHTH, EIGHTH],
  [DOTTED_HALF],
]

const BARS_BY_METER: Record<StaffJumperMeter, readonly RhythmValue[][]> = {
  simple: SIMPLE_BARS,
  compound: COMPOUND_BARS,
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
  /** Cumulative quarter-note beats from the start of the run. */
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

/** True for note values that need a flag or beam. */
export function isBeamable(value: NoteValue): boolean {
  return value === 'eighth' || value === 'sixteenth'
}

/**
 * Beam runs of short notes that share a pulse.
 *
 * Grouping by pulse rather than by bar is what makes the beat readable, and it
 * is why 6/8 beams its eighths in threes while 4/4 beams them in twos — the
 * rule is the same, only the pulse length differs.
 */
function assignBeams(
  slots: RhythmSlot[],
  fromIndex: number,
  timeline: RhythmTimeline,
  meter: MeterSpec,
): void {
  const pulseOf = (beatPosition: number) =>
    Math.floor(beatPosition / meter.pulseBeats + 1e-6)

  let runStart = fromIndex
  while (runStart < slots.length) {
    const slot = slots[runStart]!
    if (!isBeamable(slot.value)) {
      runStart += 1
      continue
    }

    const pulse = pulseOf(slot.beatPosition)
    let runEnd = runStart
    while (
      runEnd + 1 < slots.length &&
      isBeamable(slots[runEnd + 1]!.value) &&
      pulseOf(slots[runEnd + 1]!.beatPosition) === pulse
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

function appendBar(timeline: RhythmTimeline, meter: MeterSpec, seed: number): void {
  const bars = BARS_BY_METER[meter.id]
  const rng = mulberry32(seed + timeline.barCount * 2654435761)
  const bar = bars[Math.floor(rng() * bars.length)]!
  const firstNewIndex = timeline.slots.length

  bar.forEach((rhythmValue, indexInBar) => {
    timeline.slots.push({
      index: timeline.slots.length,
      value: rhythmValue.value,
      dotted: rhythmValue.dotted,
      beats: rhythmValue.beats,
      beatPosition: timeline.beatCursor,
      barIndex: timeline.barCount,
      beatInBar: timeline.beatCursor - timeline.barCount * meter.barBeats,
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
  assignBeams(timeline.slots, firstNewIndex, timeline, meter)
}

const timelineCache = new WeakMap<object, RhythmTimeline>()

/**
 * Rhythm for one note index, generated lazily and memoized against the config
 * object so repeated reads during a render are free and stay consistent.
 */
export function getRhythmSlot(
  configKey: object,
  meter: StaffJumperMeter,
  seed: number,
  index: number,
): RhythmSlot {
  let timeline = timelineCache.get(configKey)
  if (!timeline) {
    timeline = { slots: [], barCount: 0, beatCursor: 0, spacingCursor: 0, beamCursor: 0 }
    timelineCache.set(configKey, timeline)
  }
  while (index >= timeline.slots.length) appendBar(timeline, METERS[meter], seed)
  return timeline.slots[index]!
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

/** Seconds for one pulse — the unit the tempo dial counts. */
export function secondsPerPulse(bpm: number): number {
  return 60 / Math.max(1, bpm)
}

export const STAFF_JUMPER_TEMPO_MIN = 40
export const STAFF_JUMPER_TEMPO_MAX = 200
export const STAFF_JUMPER_TEMPO_DEFAULT = 80

/**
 * Half-width of the "on the beat" window as a fraction of a pulse, clamped so
 * it stays humane at fast tempos and does not become a free pass at slow ones.
 */
const ON_BEAT_WINDOW_FRACTION = 0.18
const ON_BEAT_WINDOW_MIN_MS = 90
const ON_BEAT_WINDOW_MAX_MS = 220

export function onBeatWindowMs(bpm: number): number {
  const pulseMs = secondsPerPulse(bpm) * 1000
  return Math.max(
    ON_BEAT_WINDOW_MIN_MS,
    Math.min(ON_BEAT_WINDOW_MAX_MS, pulseMs * ON_BEAT_WINDOW_FRACTION),
  )
}

export type NotePlacement = 'early' | 'on' | 'late'

export interface TimingVerdict {
  placement: NotePlacement
  errorMs: number
  /** Pulse position the *next* note is expected on. */
  nextExpectedPulse: number
}

/**
 * Judge one landing against the pulse it was written on.
 *
 * `nextExpectedPulse` is re-anchored to where the player actually landed plus
 * the note they just held, rather than to a fixed grid. Two reasons: one slow
 * note would otherwise mark every note after it late for the rest of the run,
 * and pitch detection adds a roughly constant lag that cancels out when
 * successive notes are compared to each other.
 */
export function judgeTiming(
  actualPulse: number,
  expectedPulse: number,
  heldNotePulses: number,
  bpm: number,
): TimingVerdict {
  const errorMs = (actualPulse - expectedPulse) * secondsPerPulse(bpm) * 1000
  const window = onBeatWindowMs(bpm)
  return {
    placement: Math.abs(errorMs) <= window ? 'on' : errorMs < 0 ? 'early' : 'late',
    errorMs,
    nextExpectedPulse: actualPulse + heldNotePulses,
  }
}
