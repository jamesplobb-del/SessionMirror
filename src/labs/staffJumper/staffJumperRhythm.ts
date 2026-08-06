/**
 * Rhythm for Staff Jumper.
 *
 * The pitch stream and the rhythm stream are generated independently and zipped
 * together by note index: note N takes the Nth pitch and the Nth duration. That
 * keeps the scale and pattern logic untouched and lets the meter change without
 * disturbing which notes come out.
 *
 * Rhythm arithmetic uses integer sixteenth-note units exclusively. A quarter
 * is 4 units, 4/4 is 16 units, and 6/8 is 12 units. Pulses are the metronome
 * unit: 4 units in 4/4 and 6 units (a dotted quarter) in 6/8.
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
  /** Exact measure capacity in sixteenth-note units. */
  capacityUnits: number
  /** Sixteenth-note units in one pulse — what the tempo dial counts. */
  pulseUnits: number
  pulsesPerMeasure: number
  /**
   * Sixteenth-note units between subdivision clicks.
   *
   * The app's metronome ticks the subdivision grid and accents whichever ticks
   * land on a pulse, so 6/8 clicks all six eighths with the two dotted-quarter
   * beats emphasised rather than clicking only twice a bar. Staff Jumper
   * follows the same rule.
   */
  tickUnits: number
  ticksPerPulse: number
  ticksPerBar: number
}

export const METERS: Record<StaffJumperMeter, MeterSpec> = {
  simple: {
    id: 'simple',
    numerator: 4,
    denominator: 4,
    label: '4/4',
    name: 'Simple',
    description: 'Four quarter-note beats in a bar.',
    capacityUnits: 16,
    pulseUnits: 4,
    pulsesPerMeasure: 4,
    tickUnits: 4,
    ticksPerPulse: 1,
    ticksPerBar: 4,
  },
  compound: {
    id: 'compound',
    numerator: 6,
    denominator: 8,
    label: '6/8',
    name: 'Compound',
    description: 'Two dotted-quarter beats, each split into three.',
    capacityUnits: 12,
    pulseUnits: 6,
    pulsesPerMeasure: 2,
    // Six eighths a bar, three to each dotted-quarter beat.
    tickUnits: 2,
    ticksPerPulse: 3,
    ticksPerBar: 6,
  },
}

export type NoteValue = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth'

export interface RhythmValue {
  value: NoteValue
  dotted: boolean
  /** Exact duration in sixteenth-note units, dot included. */
  durationUnits: number
}

export const DURATION_UNITS: Record<NoteValue, number> = {
  whole: 16,
  half: 8,
  quarter: 4,
  eighth: 2,
  sixteenth: 1,
}

function make(value: NoteValue, dotted = false): RhythmValue {
  const undottedUnits = DURATION_UNITS[value]
  const durationUnits = dotted ? (undottedUnits * 3) / 2 : undottedUnits
  if (!Number.isInteger(durationUnits)) {
    throw new Error(`${value} cannot be dotted on the sixteenth-note unit grid`)
  }
  return { value, dotted, durationUnits }
}

const WHOLE = make('whole')
const DOTTED_HALF = make('half', true)
const HALF = make('half')
const DOTTED_QUARTER = make('quarter', true)
const QUARTER = make('quarter')
const DOTTED_EIGHTH = make('eighth', true)
const EIGHTH = make('eighth')
const SIXTEENTH = make('sixteenth')

/**
 * Measure-length rhythm cells. Every entry sums to the meter's exact integer
 * capacity, so barlines can only occur after a complete measure.
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
  [DOTTED_EIGHTH, SIXTEENTH, QUARTER, QUARTER],
  [DOTTED_HALF],
]

export interface RhythmMeasure {
  index: number
  capacityUnits: number
  events: readonly RhythmValue[]
}

export function measureDurationUnits(measure: Pick<RhythmMeasure, 'events'>): number {
  return measure.events.reduce((sum, event) => sum + event.durationUnits, 0)
}

/**
 * Reject an invalid rhythm cell before it can reach either the preview or the
 * game. Integer sixteenth-note units avoid float comparisons and make 4/4's
 * invariant explicit: every selected measure contains exactly 16 units.
 */
function validateMeasures(
  meter: MeterSpec,
  templates: readonly RhythmValue[][],
): readonly RhythmMeasure[] {
  return templates.map((events, index) => {
    const measure: RhythmMeasure = { index, capacityUnits: meter.capacityUnits, events }
    const actualUnits = measureDurationUnits(measure)
    if (actualUnits !== meter.capacityUnits) {
      throw new Error(
        `Invalid ${meter.label} measure ${index}: expected ${meter.capacityUnits} units, got ${actualUnits}`,
      )
    }
    return measure
  })
}

const MEASURES_BY_METER: Record<StaffJumperMeter, readonly RhythmMeasure[]> = {
  simple: validateMeasures(METERS.simple, SIMPLE_BARS),
  compound: validateMeasures(METERS.compound, COMPOUND_BARS),
}

/**
 * Horizontal width a note earns, relative to a quarter note.
 *
 * Engravers do not space notes in direct proportion to duration — a whole note
 * gets more room than a quarter but nowhere near four times as much. The
 * exponent compresses the range the way engraved music looks, and as a side
 * effect eighth notes pack tightly enough to fit more of the line on screen.
 */
export function spacingUnitsForDuration(durationUnits: number): number {
  return Math.pow(Math.max(durationUnits / DURATION_UNITS.quarter, 0.0625), 0.62)
}

export interface RhythmSlot {
  index: number
  value: NoteValue
  dotted: boolean
  durationUnits: number
  /** Cumulative sixteenth-note units from the start of the run. */
  unitPosition: number
  measureIndex: number
  unitsIntoMeasure: number
  startsMeasure: boolean
  /** Model-owned spacing coordinate for a completed measure boundary. */
  barlineBeforeSpacingPosition: number | null
  /** Cumulative spacing units from the start of the run. */
  spacingPosition: number
  /** Notes beamed together share an id; null when the note stands alone. */
  beamGroupId: number | null
  beamIndexInGroup: number
  beamGroupSize: number
}

interface RhythmTimeline {
  slots: RhythmSlot[]
  measureCount: number
  unitCursor: number
  spacingCursor: number
  beamCursor: number
}

/**
 * Extra breathing room before the first note of a bar, in spacing units.
 *
 * Has to cover the barline itself plus clearance on both sides — at the old
 * value the rule was drawn straight through the notehead it preceded.
 */
export const BARLINE_SPACING_UNITS = 0.9

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
  const pulseOf = (unitPosition: number) => Math.floor(unitPosition / meter.pulseUnits)

  let runStart = fromIndex
  while (runStart < slots.length) {
    const slot = slots[runStart]!
    if (!isBeamable(slot.value)) {
      runStart += 1
      continue
    }

    const pulse = pulseOf(slot.unitPosition)
    let runEnd = runStart
    while (
      runEnd + 1 < slots.length &&
      isBeamable(slots[runEnd + 1]!.value) &&
      pulseOf(slots[runEnd + 1]!.unitPosition) === pulse
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

function appendMeasure(timeline: RhythmTimeline, meter: MeterSpec, seed: number): void {
  const measures = MEASURES_BY_METER[meter.id]
  const rng = mulberry32(seed + timeline.measureCount * 2654435761)
  const measure = measures[Math.floor(rng() * measures.length)]!
  const firstNewIndex = timeline.slots.length
  const measureStartUnits = timeline.measureCount * meter.capacityUnits
  timeline.unitCursor = measureStartUnits

  measure.events.forEach((rhythmValue, indexInMeasure) => {
    const startsMeasure = indexInMeasure === 0
    const barlineBeforeSpacingPosition =
      startsMeasure && timeline.measureCount > 0
        ? timeline.spacingCursor + BARLINE_SPACING_UNITS / 2
        : null
    timeline.slots.push({
      index: timeline.slots.length,
      value: rhythmValue.value,
      dotted: rhythmValue.dotted,
      durationUnits: rhythmValue.durationUnits,
      unitPosition: timeline.unitCursor,
      measureIndex: timeline.measureCount,
      unitsIntoMeasure: timeline.unitCursor - measureStartUnits,
      startsMeasure,
      barlineBeforeSpacingPosition,
      spacingPosition: timeline.spacingCursor + (startsMeasure ? BARLINE_SPACING_UNITS : 0),
      beamGroupId: null,
      beamIndexInGroup: 0,
      beamGroupSize: 1,
    })
    timeline.unitCursor += rhythmValue.durationUnits
    timeline.spacingCursor +=
      spacingUnitsForDuration(rhythmValue.durationUnits) +
      (startsMeasure ? BARLINE_SPACING_UNITS : 0)
  })

  if (timeline.unitCursor - measureStartUnits !== measure.capacityUnits) {
    throw new Error(`Generated ${meter.label} measure did not reach exact capacity`)
  }
  timeline.measureCount += 1
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
    timeline = { slots: [], measureCount: 0, unitCursor: 0, spacingCursor: 0, beamCursor: 0 }
    timelineCache.set(configKey, timeline)
  }
  while (index >= timeline.slots.length) appendMeasure(timeline, METERS[meter], seed)
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
