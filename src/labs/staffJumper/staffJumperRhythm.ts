/**
 * Rhythm for Staff Jumper.
 *
 * The pitch stream and the rhythm stream are generated independently and zipped
 * together by note index: note N takes the Nth pitch and the Nth duration. That
 * keeps the scale and pattern logic untouched and lets the meter change without
 * disturbing which notes come out.
 *
 * Rests occupy a slot in the rhythm stream but consume no pitch — every slot
 * carries the `noteIndex` it zips to, so inserting silence shifts nothing in the
 * exercise the player is reading.
 *
 * Rhythm arithmetic uses integer sixteenth-note units exclusively. A quarter
 * is 4 units, 4/4 is 16 units, and 6/8 is 12 units. Pulses are the metronome
 * unit: 4 units in 4/4 and 6 units (a dotted quarter) in 6/8.
 */
import type { StaffJumperDifficulty } from './staffJumperMusicLogic'

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
  /**
   * Sounded length that makes a bar feel like the end of a phrase.
   *
   * A half note in 4/4 and a dotted quarter in 6/8 — one that occupies enough
   * of the bar to read as an arrival rather than another note going past. A
   * note followed by rests counts its silence towards this: the breath after a
   * short note closes a phrase just as convincingly as holding a long one.
   */
  closingMinUnits: number
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
    closingMinUnits: 8,
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
    closingMinUnits: 6,
  },
}

export type NoteValue = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth'

export interface RhythmValue {
  value: NoteValue
  dotted: boolean
  /** Silence of this length rather than a sounded note. */
  isRest: boolean
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

function build(value: NoteValue, dotted: boolean, isRest: boolean): RhythmValue {
  const undottedUnits = DURATION_UNITS[value]
  const durationUnits = dotted ? (undottedUnits * 3) / 2 : undottedUnits
  if (!Number.isInteger(durationUnits)) {
    throw new Error(`${value} cannot be dotted on the sixteenth-note unit grid`)
  }
  return { value, dotted, isRest, durationUnits }
}

function make(value: NoteValue, dotted = false): RhythmValue {
  return build(value, dotted, false)
}

function rest(value: NoteValue, dotted = false): RhythmValue {
  return build(value, dotted, true)
}

const WHOLE = make('whole')
const DOTTED_HALF = make('half', true)
const HALF = make('half')
const DOTTED_QUARTER = make('quarter', true)
const QUARTER = make('quarter')
const DOTTED_EIGHTH = make('eighth', true)
const EIGHTH = make('eighth')
const SIXTEENTH = make('sixteenth')

const HALF_REST = rest('half')
const QUARTER_REST = rest('quarter')
const EIGHTH_REST = rest('eighth')
const SIXTEENTH_REST = rest('sixteenth')

/**
 * A measure-length rhythm cell and the lowest difficulty it may appear at.
 *
 * Harder settings inherit easier cells, but the phrase composer strongly
 * prefers the current tier, so hard is not easy with extra rests stapled on.
 */
interface BarTemplate {
  events: readonly RhythmValue[]
  tier: StaffJumperDifficulty
}

const bar = (tier: StaffJumperDifficulty, ...events: RhythmValue[]): BarTemplate => ({ events, tier })

/**
 * 4/4 cells. Every entry sums to the meter's exact integer capacity, so
 * barlines can only occur after a complete measure.
 *
 * Rests occupy a whole beat or one half of a beat — never a chopped-up beam
 * group. Harder tiers add sixteenths and dotted-eighth / sixteenth figures,
 * not more fragmented eighth rests.
 */
const SIMPLE_BARS: readonly BarTemplate[] = [
  bar('easy', QUARTER, QUARTER, QUARTER, QUARTER),
  bar('easy', HALF, QUARTER, QUARTER),
  bar('easy', QUARTER, QUARTER, HALF),
  bar('easy', EIGHTH, EIGHTH, QUARTER, QUARTER, QUARTER),
  bar('easy', QUARTER, EIGHTH, EIGHTH, HALF),
  bar('easy', HALF, HALF),
  bar('easy', QUARTER, QUARTER, EIGHTH, EIGHTH, QUARTER),
  bar('easy', EIGHTH, EIGHTH, EIGHTH, EIGHTH, HALF),
  bar('easy', WHOLE),
  bar('easy', QUARTER, HALF, QUARTER),
  bar('easy', EIGHTH, EIGHTH, QUARTER, EIGHTH, EIGHTH, QUARTER),
  bar('easy', EIGHTH, EIGHTH, HALF, QUARTER),
  bar('easy', QUARTER, DOTTED_HALF),
  bar('easy', EIGHTH, EIGHTH, QUARTER, HALF),
  bar('easy', QUARTER, QUARTER, QUARTER, QUARTER_REST),
  bar('easy', QUARTER, QUARTER, HALF_REST),
  bar('easy', HALF, QUARTER, QUARTER_REST),
  bar('easy', QUARTER, QUARTER_REST, QUARTER, QUARTER),

  bar('medium', QUARTER_REST, QUARTER, QUARTER, QUARTER),
  bar('medium', HALF_REST, QUARTER, QUARTER),
  bar('medium', HALF, QUARTER_REST, QUARTER),
  bar('medium', EIGHTH, EIGHTH, QUARTER, QUARTER_REST, QUARTER),
  bar('medium', QUARTER, EIGHTH, EIGHTH, EIGHTH, EIGHTH, QUARTER),
  bar('medium', EIGHTH, EIGHTH, EIGHTH, EIGHTH, QUARTER, QUARTER),
  bar('medium', HALF, EIGHTH, EIGHTH, QUARTER),
  bar('medium', QUARTER, QUARTER_REST, HALF),
  bar('medium', QUARTER, EIGHTH, EIGHTH, QUARTER, QUARTER_REST),
  bar('medium', EIGHTH_REST, EIGHTH, QUARTER, QUARTER, QUARTER),
  bar('medium', QUARTER, QUARTER, EIGHTH_REST, EIGHTH, QUARTER),
  bar('medium', EIGHTH, EIGHTH, EIGHTH, EIGHTH, EIGHTH, EIGHTH, QUARTER),

  bar('hard', SIXTEENTH, SIXTEENTH, SIXTEENTH, SIXTEENTH, QUARTER, QUARTER, QUARTER),
  bar('hard', SIXTEENTH_REST, SIXTEENTH, SIXTEENTH, SIXTEENTH, QUARTER, QUARTER, QUARTER),
  bar('hard', QUARTER, SIXTEENTH, SIXTEENTH, SIXTEENTH, SIXTEENTH, QUARTER, QUARTER),
  bar('hard', QUARTER, QUARTER, SIXTEENTH, SIXTEENTH, SIXTEENTH, SIXTEENTH, QUARTER),
  bar('hard', DOTTED_EIGHTH, SIXTEENTH, QUARTER, QUARTER, QUARTER),
  bar('hard', QUARTER, DOTTED_EIGHTH, SIXTEENTH, QUARTER, QUARTER),
  bar('hard', QUARTER, QUARTER, DOTTED_EIGHTH, SIXTEENTH, QUARTER),
  bar('hard', DOTTED_EIGHTH, SIXTEENTH, DOTTED_EIGHTH, SIXTEENTH, QUARTER, QUARTER),
  bar('hard', DOTTED_EIGHTH, SIXTEENTH, EIGHTH, EIGHTH, QUARTER, QUARTER),
  bar('hard', EIGHTH, EIGHTH, DOTTED_EIGHTH, SIXTEENTH, QUARTER, QUARTER),
  bar('hard', EIGHTH, SIXTEENTH, SIXTEENTH, QUARTER, QUARTER, QUARTER),
  bar('hard', SIXTEENTH, SIXTEENTH, EIGHTH, QUARTER, QUARTER, QUARTER),
  bar('hard', QUARTER, EIGHTH, SIXTEENTH, SIXTEENTH, QUARTER, QUARTER),
  bar('hard', QUARTER, SIXTEENTH, SIXTEENTH, EIGHTH, QUARTER, QUARTER),
  bar('hard', EIGHTH, EIGHTH, EIGHTH, EIGHTH, EIGHTH, EIGHTH, QUARTER),
  bar('hard', EIGHTH, EIGHTH, EIGHTH, EIGHTH, QUARTER, QUARTER),
  bar('hard', SIXTEENTH, SIXTEENTH, SIXTEENTH, SIXTEENTH, EIGHTH, EIGHTH, QUARTER, QUARTER),
  bar('hard', SIXTEENTH, SIXTEENTH, SIXTEENTH, SIXTEENTH, SIXTEENTH, SIXTEENTH, SIXTEENTH, SIXTEENTH, HALF),
  bar('hard', QUARTER, SIXTEENTH, SIXTEENTH, EIGHTH, HALF),
  bar('hard', EIGHTH, EIGHTH, HALF, QUARTER_REST),
  bar('hard', QUARTER_REST, QUARTER, HALF),
  bar('hard', EIGHTH, EIGHTH, EIGHTH, EIGHTH, HALF),
  bar('hard', QUARTER, EIGHTH, EIGHTH, EIGHTH, EIGHTH, QUARTER),
  bar('hard', SIXTEENTH, SIXTEENTH, SIXTEENTH, SIXTEENTH, HALF, QUARTER),
  bar('hard', QUARTER_REST, EIGHTH, EIGHTH, QUARTER, QUARTER),
  bar('hard', QUARTER, QUARTER, EIGHTH, SIXTEENTH, SIXTEENTH, QUARTER),
  bar('hard', EIGHTH, EIGHTH, QUARTER, DOTTED_EIGHTH, SIXTEENTH, QUARTER),
  bar('hard', DOTTED_QUARTER, EIGHTH, QUARTER, QUARTER),
  bar('hard', QUARTER, DOTTED_QUARTER, EIGHTH, QUARTER),
]

/**
 * 6/8 cells. Each dotted-quarter pulse is filled in one of the usual ways.
 *
 * Rests stay inside their own pulse: a silent compound beat is written as a
 * quarter rest plus an eighth rest rather than a dotted rest, which is how the
 * beat's three-part division stays visible on the page. An eighth rest takes
 * the first or last third of a beat, never the middle — that splits the beam
 * into two flagged notes with a rest jammed between them.
 */
const COMPOUND_BARS: readonly BarTemplate[] = [
  bar('easy', DOTTED_QUARTER, DOTTED_QUARTER),
  bar('easy', EIGHTH, EIGHTH, EIGHTH, EIGHTH, EIGHTH, EIGHTH),
  bar('easy', DOTTED_QUARTER, EIGHTH, EIGHTH, EIGHTH),
  bar('easy', EIGHTH, EIGHTH, EIGHTH, DOTTED_QUARTER),
  bar('easy', QUARTER, EIGHTH, QUARTER, EIGHTH),
  bar('easy', QUARTER, EIGHTH, DOTTED_QUARTER),
  bar('easy', DOTTED_QUARTER, QUARTER, EIGHTH),
  bar('easy', EIGHTH, EIGHTH, EIGHTH, QUARTER, EIGHTH),
  bar('easy', QUARTER, EIGHTH, EIGHTH, EIGHTH, EIGHTH),
  bar('easy', DOTTED_HALF),
  bar('easy', QUARTER, EIGHTH, QUARTER, EIGHTH_REST),
  bar('easy', DOTTED_QUARTER, QUARTER, EIGHTH_REST),
  bar('easy', QUARTER, EIGHTH, QUARTER_REST, EIGHTH_REST),

  bar('medium', DOTTED_EIGHTH, SIXTEENTH, EIGHTH, DOTTED_QUARTER),
  bar('medium', EIGHTH, EIGHTH, EIGHTH, QUARTER, EIGHTH_REST),
  bar('medium', EIGHTH_REST, EIGHTH, EIGHTH, DOTTED_QUARTER),
  bar('medium', EIGHTH, EIGHTH, EIGHTH_REST, DOTTED_QUARTER),
  bar('medium', DOTTED_QUARTER, EIGHTH, EIGHTH, EIGHTH_REST),
  bar('medium', QUARTER, EIGHTH_REST, DOTTED_QUARTER),
  bar('medium', QUARTER, EIGHTH, EIGHTH, QUARTER),
  bar('medium', EIGHTH_REST, EIGHTH, EIGHTH, QUARTER, EIGHTH),

  bar('hard', DOTTED_EIGHTH, SIXTEENTH, EIGHTH, QUARTER, EIGHTH),
  bar('hard', EIGHTH, EIGHTH, EIGHTH, DOTTED_EIGHTH, SIXTEENTH, EIGHTH),
  bar('hard', DOTTED_EIGHTH, SIXTEENTH, EIGHTH, EIGHTH, EIGHTH, EIGHTH),
  bar('hard', QUARTER_REST, EIGHTH, EIGHTH, EIGHTH, EIGHTH),
  bar('hard', QUARTER, EIGHTH, EIGHTH, EIGHTH, EIGHTH_REST),
  bar('hard', EIGHTH, QUARTER, EIGHTH, EIGHTH, EIGHTH),
  bar('hard', QUARTER_REST, EIGHTH, DOTTED_QUARTER),
  bar('hard', EIGHTH, EIGHTH, EIGHTH, QUARTER, EIGHTH),
  bar('hard', DOTTED_EIGHTH, SIXTEENTH, EIGHTH, DOTTED_EIGHTH, SIXTEENTH, EIGHTH),
]

export interface RhythmMeasure {
  index: number
  capacityUnits: number
  events: readonly RhythmValue[]
  tier: StaffJumperDifficulty
  /** True when this bar ends on an arrival — see `closingMinUnits`. */
  closes: boolean
}

/**
 * Bars to a phrase.
 *
 * Four is the norm music is built out of, but at easy the tempo is slow and
 * the reading is the hard part, so two bars puts a breath within reach and
 * makes the antecedent/consequent pairing audible as a four-bar period rather
 * than an eight-bar one nobody can hold in their head.
 */
export const PHRASE_BARS: Record<StaffJumperDifficulty, number> = {
  easy: 2,
  medium: 4,
  hard: 4,
}

/**
 * Does this bar end like the end of a phrase?
 *
 * Two ways to close: hold the last note long, or play a shorter one and leave
 * the rest of the bar silent. Both read as arrival. What does *not* close is a
 * bar whose last sounded note is shorter than a beat — a sixteenth followed by
 * rests sounds clipped off, not finished — so the last note must be at least a
 * quarter before its trailing silence is allowed to count towards the length.
 */
function measureCloses(meter: MeterSpec, events: readonly RhythmValue[]): boolean {
  let lastSoundedIndex = -1
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (!events[index]!.isRest) {
      lastSoundedIndex = index
      break
    }
  }
  if (lastSoundedIndex < 0) return false
  const lastSounded = events[lastSoundedIndex]!
  if (lastSounded.durationUnits < DURATION_UNITS.quarter) return false
  const trailingRestUnits = events
    .slice(lastSoundedIndex + 1)
    .reduce((sum, event) => sum + event.durationUnits, 0)
  return lastSounded.durationUnits + trailingRestUnits >= meter.closingMinUnits
}

export function measureDurationUnits(measure: Pick<RhythmMeasure, 'events'>): number {
  return measure.events.reduce((sum, event) => sum + event.durationUnits, 0)
}

/**
 * Reject an invalid rhythm cell before it can reach either the preview or the
 * game. Integer sixteenth-note units avoid float comparisons and make 4/4's
 * invariant explicit: every selected measure contains exactly 16 units, rests
 * included — silence is counted against the bar exactly like a sounded note.
 */
function validateMeasures(
  meter: MeterSpec,
  templates: readonly BarTemplate[],
): readonly RhythmMeasure[] {
  return templates.map((template, index) => {
    const measure: RhythmMeasure = {
      index,
      capacityUnits: meter.capacityUnits,
      events: template.events,
      tier: template.tier,
      closes: measureCloses(meter, template.events),
    }
    const actualUnits = measureDurationUnits(measure)
    if (actualUnits !== meter.capacityUnits) {
      throw new Error(
        `Invalid ${meter.label} measure ${index}: expected ${meter.capacityUnits} units, got ${actualUnits}`,
      )
    }
    // A bar of pure silence would leave the player nothing to read or play.
    if (!measure.events.some((event) => !event.isRest)) {
      throw new Error(`Invalid ${meter.label} measure ${index}: no sounded note`)
    }
    assertConventionalGrouping(meter, template.events, index)
    return measure
  })
}

/**
 * Beats should look like method-book music at every difficulty. Harder tiers
 * add sixteenths and dotted figures — they do not chop a beam with an eighth
 * rest in the middle, or write a quarter starting on the 'and'.
 */
function assertConventionalGrouping(
  meter: MeterSpec,
  events: readonly RhythmValue[],
  measureIndex: number,
): void {
  const fail = (detail: string) => {
    throw new Error(`Invalid ${meter.label} measure ${measureIndex}: ${detail}`)
  }
  let cursor = 0
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i]!
    const offset = cursor % meter.pulseUnits
    const startPulse = Math.floor(cursor / meter.pulseUnits)
    const endPulse = Math.floor((cursor + event.durationUnits - 1) / meter.pulseUnits)

    if (event.isRest && event.value === 'eighth' && meter.id === 'compound' && offset === 2) {
      fail('eighth rest cannot sit in the middle of a compound beat')
    }
    if (event.value === 'eighth' && event.dotted && offset !== 0) {
      fail('dotted eighth must begin on the beat')
    }
    if (
      meter.id === 'simple' &&
      event.value === 'quarter' &&
      !event.dotted &&
      offset !== 0
    ) {
      fail('quarter must sit on the beat, not the and')
    }
    if (
      meter.id === 'compound' &&
      event.durationUnits < meter.capacityUnits &&
      startPulse !== endPulse
    ) {
      fail('event crosses a dotted-quarter beat')
    }
    cursor += event.durationUnits
  }
}

const MEASURES_BY_METER: Record<StaffJumperMeter, readonly RhythmMeasure[]> = {
  simple: validateMeasures(METERS.simple, SIMPLE_BARS),
  compound: validateMeasures(METERS.compound, COMPOUND_BARS),
}

const TIER_ORDER: Record<StaffJumperDifficulty, number> = { easy: 0, medium: 1, hard: 2 }

/** Cells a difficulty may draw from — its own tier plus everything below it. */
function measuresFor(
  meter: StaffJumperMeter,
  difficulty: StaffJumperDifficulty,
): readonly RhythmMeasure[] {
  return MEASURES_BY_METER[meter].filter(
    (measure) => TIER_ORDER[measure.tier] <= TIER_ORDER[difficulty],
  )
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
  return Math.max(0.75, Math.pow(Math.max(durationUnits / DURATION_UNITS.quarter, 0.0625), 0.62))
}

export interface RhythmSlot {
  index: number
  value: NoteValue
  dotted: boolean
  isRest: boolean
  /**
   * Position in the pitch stream this slot zips to.
   *
   * Rests take no pitch, so they carry the index of the note that follows and
   * leave the exercise sequence itself untouched.
   */
  noteIndex: number
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

/** Where one phrase sits in the stream of sounded notes. */
export interface PhraseSpan {
  index: number
  /** Index of this phrase's first sounded note. */
  firstNoteIndex: number
  /** How many sounded notes the phrase's bars turned out to contain. */
  noteCount: number
}

interface RhythmTimeline {
  slots: RhythmSlot[]
  measureCount: number
  /** Completed phrases, in order — appended as each phrase's last bar lands. */
  phrases: PhraseSpan[]
  /** Note cursor as the phrase under construction began. */
  phraseStartNoteCursor: number
  unitCursor: number
  spacingCursor: number
  beamCursor: number
  /** How many sounded notes the timeline has emitted so far. */
  noteCursor: number
  /** Remaining bars of the phrase currently being written. */
  phraseQueue: RhythmValue[][]
  /** Fingerprints of recent bars, used to keep the page from reprinting itself. */
  recentFingerprints: string[]
}

/**
 * Extra breathing room before the first note of a bar, in spacing units.
 *
 * Has to cover the barline itself plus clearance on both sides — at the old
 * value the rule was drawn straight through the notehead it preceded.
 */
export const BARLINE_SPACING_UNITS = 0.9

/**
 * Rests sit on the middle line, so without extra room an eighth rest lands
 * inside a neighbouring B, D or C. Lead/trail is space on either side of the
 * glyph; the minimum is the slot itself, which has to clear a notehead plus
 * the rest's own ink.
 */
export const REST_LEAD_SPACING = 0.44
export const REST_TRAIL_SPACING = 0.38
export const REST_MIN_SPACING = 1.14
export const FLAGGED_REST_LEAD = 0.24

/**
 * A dotted note's dot sits to the right of the head — and of an up-stem — so
 * the following note needs extra room or its down-stem covers the dot. Dotted
 * eighth plus sixteenth is the usual case: at ordinary eighth packing the
 * sixteenth's left-hand stem lands on the dot.
 */
export const DOTTED_MIN_SPACING = 1.22

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

function fingerprintEvents(events: readonly Pick<RhythmValue, 'value' | 'dotted' | 'isRest'>[]): string {
  return events.map((event) => `${event.isRest ? 'r' : ''}${event.value}${event.dotted ? '.' : ''}`).join('|')
}

function pickWeighted<T>(items: readonly T[], weightOf: (item: T) => number, rng: () => number): T {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0)
  if (total <= 0) return items[Math.floor(rng() * items.length)]!
  let ticket = rng() * total
  for (const item of items) {
    ticket -= weightOf(item)
    if (ticket <= 0) return item
  }
  return items[items.length - 1]!
}

function measureWeight(
  measure: RhythmMeasure,
  difficulty: StaffJumperDifficulty,
  recent: readonly string[],
  avoid: ReadonlySet<string>,
): number {
  const fp = fingerprintEvents(measure.events)
  if (avoid.has(fp)) return 0.0001
  const distance = TIER_ORDER[difficulty] - TIER_ORDER[measure.tier]
  let weight = distance === 0 ? 5.2 : distance === 1 ? 1.15 : 0.28
  const hits = recent.filter((entry) => entry === fp).length
  weight *= 1 / (1 + hits * 12)
  if (fp === recent[recent.length - 1]) weight *= 0.04
  return weight
}

function pickMeasure(
  pool: readonly RhythmMeasure[],
  difficulty: StaffJumperDifficulty,
  rng: () => number,
  recent: readonly string[],
  avoid: ReadonlySet<string>,
): RhythmMeasure {
  const fresh = pool.filter((measure) => !avoid.has(fingerprintEvents(measure.events)))
  const use = fresh.length > 0 ? fresh : pool
  return pickWeighted(use, (measure) => measureWeight(measure, difficulty, recent, avoid), rng)
}

function relatedMeasure(
  idea: RhythmMeasure,
  pool: readonly RhythmMeasure[],
  difficulty: StaffJumperDifficulty,
  rng: () => number,
  recent: readonly string[],
  avoid: ReadonlySet<string>,
): RhythmMeasure {
  const ideaFp = fingerprintEvents(idea.events)
  const ideaHead = idea.events[0]
  const rhymes = pool.filter((measure) => {
    const fp = fingerprintEvents(measure.events)
    if (fp === ideaFp || avoid.has(fp)) return false
    const head = measure.events[0]
    return (
      head != null &&
      ideaHead != null &&
      head.value === ideaHead.value &&
      head.isRest === ideaHead.isRest &&
      head.dotted === ideaHead.dotted
    )
  })
  if (rhymes.length > 0) {
    return pickWeighted(rhymes, (measure) => measureWeight(measure, difficulty, recent, avoid), rng)
  }
  return pickMeasure(pool, difficulty, rng, recent, new Set([...avoid, ideaFp]))
}

type PhraseForm = 'period' | 'sentence' | 'through'

function pickPhraseForm(difficulty: StaffJumperDifficulty, rng: () => number): PhraseForm {
  if (difficulty === 'easy') return 'period'
  return pickWeighted(
    [
      ['period', 2.4],
      ['sentence', 2.1],
      ['through', 1.3],
    ] as const,
    ([, weight]) => weight,
    rng,
  )[0]
}

/**
 * Compose the bars of one phrase as a whole, then emit them one at a time.
 *
 * Period: an idea, a continuation, a *related* return of the idea, then a close.
 * Sentence: the idea, a rhyme, denser motion, then a close.
 * Through: three different moving bars and a close.
 *
 * Bar three is never a photocopy of bar one — that reprint is what made hard
 * mode feel like the same quarter / eighth-rest cell forever.
 */
function composePhraseBars(
  meter: MeterSpec,
  difficulty: StaffJumperDifficulty,
  rng: () => number,
  recent: string[],
): RhythmValue[][] {
  const all = measuresFor(meter.id, difficulty)
  const movers = all.filter((measure) => !measure.closes)
  const closers = all.filter((measure) => measure.closes)
  const movePool = movers.length > 0 ? movers : all
  const closePool = closers.length > 0 ? closers : all
  const remember = (measure: RhythmMeasure) => {
    const fp = fingerprintEvents(measure.events)
    recent.push(fp)
    if (recent.length > 16) recent.shift()
    return [...measure.events]
  }

  const bars = PHRASE_BARS[difficulty]
  if (bars === 2) {
    const idea = pickMeasure(movePool, difficulty, rng, recent, new Set())
    const close = pickMeasure(
      closePool,
      difficulty,
      rng,
      recent,
      new Set([fingerprintEvents(idea.events)]),
    )
    return [remember(idea), remember(close)]
  }

  const form = pickPhraseForm(difficulty, rng)
  const idea = pickMeasure(movePool, difficulty, rng, recent, new Set())
  const ideaFp = fingerprintEvents(idea.events)

  if (form === 'period') {
    const middle = pickMeasure(movePool, difficulty, rng, recent, new Set([ideaFp]))
    const recall = relatedMeasure(
      idea,
      movePool,
      difficulty,
      rng,
      recent,
      new Set([ideaFp, fingerprintEvents(middle.events)]),
    )
    const close = pickMeasure(
      closePool,
      difficulty,
      rng,
      recent,
      new Set([ideaFp, fingerprintEvents(middle.events), fingerprintEvents(recall.events)]),
    )
    return [remember(idea), remember(middle), remember(recall), remember(close)]
  }

  if (form === 'sentence') {
    const rhyme = relatedMeasure(idea, movePool, difficulty, rng, recent, new Set([ideaFp]))
    const ideaDensity = idea.events.filter((event) => !event.isRest).length
    const denserPool = movePool.filter(
      (measure) =>
        fingerprintEvents(measure.events) !== ideaFp &&
        measure.events.filter((event) => !event.isRest).length >= ideaDensity,
    )
    const continuation = pickMeasure(
      denserPool.length > 0 ? denserPool : movePool,
      difficulty,
      rng,
      recent,
      new Set([ideaFp, fingerprintEvents(rhyme.events)]),
    )
    const close = pickMeasure(
      closePool,
      difficulty,
      rng,
      recent,
      new Set([ideaFp, fingerprintEvents(rhyme.events), fingerprintEvents(continuation.events)]),
    )
    return [remember(idea), remember(rhyme), remember(continuation), remember(close)]
  }

  const seen = new Set<string>()
  const moving: RhythmValue[][] = []
  for (let index = 0; index < 3; index += 1) {
    const next = pickMeasure(movePool, difficulty, rng, recent, seen)
    seen.add(fingerprintEvents(next.events))
    moving.push(remember(next))
  }
  moving.push(remember(pickMeasure(closePool, difficulty, rng, recent, seen)))
  return moving
}

function slotClearance(event: RhythmValue, previous: RhythmSlot | undefined): { lead: number; trail: number; own: number } {
  let own = spacingUnitsForDuration(event.durationUnits)
  let lead = 0
  let trail = 0
  if (event.isRest) {
    const flaggedLead =
      previous && !previous.isRest && isBeamable(previous.value) ? FLAGGED_REST_LEAD : 0
    lead = REST_LEAD_SPACING + flaggedLead
    trail = REST_TRAIL_SPACING
    own = Math.max(own, REST_MIN_SPACING)
  }
  if (event.dotted && !event.isRest) {
    own = Math.max(own, DOTTED_MIN_SPACING)
  }
  return { lead, trail, own }
}

/** True for note values that need a flag or beam. */
export function isBeamable(value: NoteValue): boolean {
  return value === 'eighth' || value === 'sixteenth'
}

/** Rests carry no stem, so they never join the beam over them. */
function joinsBeam(slot: RhythmSlot): boolean {
  return !slot.isRest && isBeamable(slot.value)
}

/**
 * Beam runs of short notes that share a pulse.
 *
 * Grouping by pulse rather than by bar is what makes the beat readable, and it
 * is why 6/8 beams its eighths in threes while 4/4 beams them in twos — the
 * rule is the same, only the pulse length differs. A rest breaks the run: the
 * notes on either side of it are flagged or beamed separately.
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
    if (!joinsBeam(slot)) {
      runStart += 1
      continue
    }

    const pulse = pulseOf(slot.unitPosition)
    let runEnd = runStart
    while (
      runEnd + 1 < slots.length &&
      joinsBeam(slots[runEnd + 1]!) &&
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

function appendMeasure(
  timeline: RhythmTimeline,
  meter: MeterSpec,
  difficulty: StaffJumperDifficulty,
  seed: number,
): void {
  if (timeline.phraseQueue.length === 0) {
    const phraseRng = mulberry32(seed + timeline.phrases.length * 2654435761 + 17)
    timeline.phraseQueue = composePhraseBars(meter, difficulty, phraseRng, timeline.recentFingerprints)
  }
  const events = timeline.phraseQueue.shift()!
  const firstNewIndex = timeline.slots.length
  const measureStartUnits = timeline.measureCount * meter.capacityUnits
  timeline.unitCursor = measureStartUnits

  events.forEach((rhythmValue, indexInMeasure) => {
    const startsMeasure = indexInMeasure === 0
    const previous = timeline.slots.at(-1)
    const clearance = slotClearance(rhythmValue, previous)
    const barlinePad = startsMeasure ? BARLINE_SPACING_UNITS : 0
    const barlineBeforeSpacingPosition =
      startsMeasure && timeline.measureCount > 0
        ? timeline.spacingCursor + BARLINE_SPACING_UNITS / 2
        : null
    timeline.slots.push({
      index: timeline.slots.length,
      value: rhythmValue.value,
      dotted: rhythmValue.dotted,
      isRest: rhythmValue.isRest,
      noteIndex: timeline.noteCursor,
      durationUnits: rhythmValue.durationUnits,
      unitPosition: timeline.unitCursor,
      measureIndex: timeline.measureCount,
      unitsIntoMeasure: timeline.unitCursor - measureStartUnits,
      startsMeasure,
      barlineBeforeSpacingPosition,
      spacingPosition: timeline.spacingCursor + barlinePad + clearance.lead,
      beamGroupId: null,
      beamIndexInGroup: 0,
      beamGroupSize: 1,
    })
    timeline.unitCursor += rhythmValue.durationUnits
    if (!rhythmValue.isRest) timeline.noteCursor += 1
    timeline.spacingCursor += clearance.own + barlinePad + clearance.lead + clearance.trail
  })

  if (timeline.unitCursor - measureStartUnits !== meter.capacityUnits) {
    throw new Error(`Generated ${meter.label} measure did not reach exact capacity`)
  }
  timeline.measureCount += 1
  assignBeams(timeline.slots, firstNewIndex, timeline, meter)

  if (timeline.measureCount % PHRASE_BARS[difficulty] === 0) {
    timeline.phrases.push({
      index: timeline.phrases.length,
      firstNoteIndex: timeline.phraseStartNoteCursor,
      noteCount: timeline.noteCursor - timeline.phraseStartNoteCursor,
    })
    timeline.phraseStartNoteCursor = timeline.noteCursor
  }
}

const timelineCache = new WeakMap<object, RhythmTimeline>()

/**
 * Rhythm for one note index, generated lazily and memoized against the config
 * object so repeated reads during a render are free and stay consistent.
 */
function getTimeline(configKey: object): RhythmTimeline {
  let timeline = timelineCache.get(configKey)
  if (!timeline) {
    timeline = {
      slots: [],
      measureCount: 0,
      phrases: [],
      phraseStartNoteCursor: 0,
      unitCursor: 0,
      spacingCursor: 0,
      beamCursor: 0,
      noteCursor: 0,
      phraseQueue: [],
      recentFingerprints: [],
    }
    timelineCache.set(configKey, timeline)
  }
  return timeline
}

export function getRhythmSlot(
  configKey: object,
  meter: StaffJumperMeter,
  difficulty: StaffJumperDifficulty,
  seed: number,
  index: number,
): RhythmSlot {
  const timeline = getTimeline(configKey)
  while (index >= timeline.slots.length) {
    appendMeasure(timeline, METERS[meter], difficulty, seed)
  }
  return timeline.slots[index]!
}

/**
 * The note-index range one phrase covers.
 *
 * The pitch stream is built phrase by phrase against this, which is what lets
 * a melodic line arrive exactly where the rhythm arrives. Bars are appended
 * until the phrase is complete, so the count returned is final — the rhythm
 * decides how many notes a phrase holds, and the melody fills that many.
 */
export function getPhraseSpan(
  configKey: object,
  meter: StaffJumperMeter,
  difficulty: StaffJumperDifficulty,
  seed: number,
  phraseIndex: number,
): PhraseSpan {
  const timeline = getTimeline(configKey)
  while (phraseIndex >= timeline.phrases.length) {
    appendMeasure(timeline, METERS[meter], difficulty, seed)
  }
  return timeline.phrases[phraseIndex]!
}

/**
 * Written length of every note in a phrase, in sixteenth-note units.
 *
 * What the melody needs in order to know how much time the player has at each
 * step: the same interval is a different skill on a half note and on an
 * eighth, so the leap rules are applied against these.
 */
export function getPhraseNoteDurations(
  configKey: object,
  meter: StaffJumperMeter,
  difficulty: StaffJumperDifficulty,
  seed: number,
  phraseIndex: number,
): number[] {
  const span = getPhraseSpan(configKey, meter, difficulty, seed, phraseIndex)
  const timeline = getTimeline(configKey)
  const lastNoteIndex = span.firstNoteIndex + span.noteCount - 1
  const durations: number[] = []
  for (const slot of timeline.slots) {
    if (slot.isRest) continue
    if (slot.noteIndex < span.firstNoteIndex) continue
    if (slot.noteIndex > lastNoteIndex) break
    durations.push(slot.durationUnits)
  }
  return durations
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

/** How long a written value lasts at a tempo — what a rest has to be held for. */
export function durationMs(durationUnits: number, meter: MeterSpec, bpm: number): number {
  return (durationUnits / meter.pulseUnits) * secondsPerPulse(bpm) * 1000
}

/**
 * How long the player lingers on a note before hopping to the next one, with
 * the metronome *off*. (With it on, the click paces the run and the player
 * stands on a note for its full written length — see staffJumperRhythmReading.)
 *
 * Deliberately *not* the note's written length: holding a whole note for its
 * full four beats makes an unpaced game feel stalled, and without a click the
 * game does not claim to assess duration. This is a compressed version of the written length —
 * long notes visibly dwell longer than short ones, but the spread is squared
 * off so the longest note costs a beat's worth of pause rather than a bar's.
 *
 * Scaling on the square root keeps the ordering the player reads on the page
 * (sixteenth < eighth < quarter < half < whole) while pulling the extremes in
 * towards each other.
 */
const LINGER_QUARTER_MS = 260
const LINGER_MAX_MS = 700
/** Never dwell past the note itself — the binding limit at fast tempos. */
const LINGER_MAX_FRACTION = 0.7

export function lingerMs(durationUnits: number, meter: MeterSpec, bpm: number): number {
  const writtenMs = durationMs(durationUnits, meter, bpm)
  const scaled = LINGER_QUARTER_MS * Math.sqrt(durationUnits / DURATION_UNITS.quarter)
  return Math.min(scaled, LINGER_MAX_MS, writtenMs * LINGER_MAX_FRACTION)
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
