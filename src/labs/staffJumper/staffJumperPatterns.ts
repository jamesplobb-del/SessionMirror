/**
 * The exercise vocabulary — the shapes a player actually practises.
 *
 * Everything is written as offsets from a starting scale degree, so a pattern
 * is automatically diatonic in whatever key and mode the run is set to: degree
 * offsets [0, 2, 4] outline the triad on any degree of any scale without the
 * pattern needing to know a single note name.
 *
 * A run is a full scale statement followed by an endless stream of these,
 * chosen at random from the difficulty's vocabulary and often sequenced up or
 * down the scale the way a real exercise book would.
 */
import type { TunerInstrument } from '../../utils/pitchConfig'
import type { StaffJumperDifficulty } from './staffJumperMusicLogic'

/**
 * Widest melodic interval a tier may write, in scale degrees.
 *
 * A third at easy, a sixth at medium, an octave at hard — the octave being the
 * point of the octave-leap and triad-to-the-octave shapes rather than an
 * accident. Degrees, not semitones: the scale is the unit the exercise thinks
 * in, and a third is a third whether it is major or minor.
 */
const TIER_MAX_LEAP: Record<StaffJumperDifficulty, number> = {
  easy: 3,
  medium: 5,
  hard: 7,
}

/**
 * How much of that a fast note gives back.
 *
 * The interval is only half of what makes a leap hard — the other half is how
 * long the player has to make it. An octave on a half note and the same octave
 * on an eighth are different skills entirely, so the cap tightens as the notes
 * get shorter and running passagework stays close to stepwise.
 */
function speedAllowance(shorterUnits: number): number {
  if (shorterUnits <= 1) return -3
  if (shorterUnits <= 2) return -2
  if (shorterUnits <= 3) return -1
  return 0
}

/**
 * What the instrument itself makes hard.
 *
 * Singers pitch an interval from nothing, with no fingering to lean on, so a
 * wide one is harder for them at any speed. Winds — brass especially — change
 * partial or register to leap, and that costs *time*: this is the rule that
 * stops an octave slur landing in a run of eighths under a trumpet player.
 * Strings sit at the baseline; a leap there is a shift or a string crossing,
 * which the tier cap already covers.
 */
function instrumentAllowance(instrument: TunerInstrument, shorterUnits: number): number {
  if (instrument === 'voice') return -1
  if (instrument === 'winds') return shorterUnits <= 2 ? -1 : 0
  return 0
}

/**
 * The widest interval allowed between two particular notes.
 *
 * `shorterUnits` is the shorter of the pair — a leap is only as comfortable as
 * the quicker of the two notes it joins. Never drops below a step, or there
 * would be no legal move at all.
 */
export function maxLeapDegrees(
  difficulty: StaffJumperDifficulty,
  instrument: TunerInstrument,
  shorterUnits: number,
): number {
  return Math.max(
    1,
    TIER_MAX_LEAP[difficulty] +
      speedAllowance(shorterUnits) +
      instrumentAllowance(instrument, shorterUnits),
  )
}

/**
 * Which way the shape travels, as the ear hears it.
 *
 * `arch` goes out and comes back; `static` circles one note. These two are
 * self-answering, which is why they make poor answers to anything else.
 */
export type PatternDirection = 'up' | 'down' | 'arch' | 'static'

/**
 * What kind of motion the shape is made of.
 *
 * `ornament` figures decorate a note rather than travel anywhere, so they work
 * as punctuation between larger gestures and badly as a run of their own.
 */
export type PatternCharacter = 'step' | 'leap' | 'ornament'

export interface ScalePattern {
  id: string
  /** Shown in the HUD so the player knows what shape they are reading. */
  name: string
  /** Degree offsets from the pattern's starting degree. */
  offsets: readonly number[]
  /** Lowest difficulty that unlocks this pattern; harder tiers inherit it. */
  tier: StaffJumperDifficulty
  /** Sequencing a pattern up the scale only suits the shorter shapes. */
  sequenceable: boolean
  direction: PatternDirection
  character: PatternCharacter
}

export const SCALE_PATTERNS: readonly ScalePattern[] = [
  // ── Stepwise: the vocabulary every player starts with ──
  { id: 'run-up', name: 'Four-note run', offsets: [0, 1, 2, 3], tier: 'easy', sequenceable: true, direction: 'up', character: 'step' },
  { id: 'run-down', name: 'Four-note run down', offsets: [3, 2, 1, 0], tier: 'easy', sequenceable: true, direction: 'down', character: 'step' },
  { id: 'step-back', name: 'Step and back', offsets: [0, 1, 2, 1], tier: 'easy', sequenceable: true, direction: 'arch', character: 'step' },
  { id: 'neighbour', name: 'Neighbour tone', offsets: [0, 1, 0, -1], tier: 'easy', sequenceable: true, direction: 'static', character: 'ornament' },
  { id: 'five-up', name: 'Five-note run', offsets: [0, 1, 2, 3, 4], tier: 'easy', sequenceable: true, direction: 'up', character: 'step' },

  // ── Triads and thirds ──
  { id: 'triad', name: 'Triad', offsets: [0, 2, 4], tier: 'medium', sequenceable: true, direction: 'up', character: 'leap' },
  { id: 'triad-updown', name: 'Triad up and down', offsets: [0, 2, 4, 2], tier: 'medium', sequenceable: true, direction: 'arch', character: 'leap' },
  { id: 'triad-down', name: 'Triad down', offsets: [4, 2, 0], tier: 'medium', sequenceable: true, direction: 'down', character: 'leap' },
  { id: 'broken-thirds', name: 'Broken thirds', offsets: [0, 2, 1, 3], tier: 'medium', sequenceable: true, direction: 'up', character: 'leap' },
  { id: 'thirds-run', name: 'Thirds sequence', offsets: [0, 2, 1, 3, 2, 4], tier: 'medium', sequenceable: false, direction: 'up', character: 'leap' },
  { id: 'turn', name: 'Turn', offsets: [0, 1, 0, -1, 0], tier: 'medium', sequenceable: true, direction: 'static', character: 'ornament' },
  { id: 'group-1231', name: '1‑2‑3‑1', offsets: [0, 1, 2, 0], tier: 'medium', sequenceable: true, direction: 'arch', character: 'step' },

  // ── Seventh chords, wider intervals, octaves ──
  { id: 'seventh', name: 'Seventh chord', offsets: [0, 2, 4, 6], tier: 'hard', sequenceable: true, direction: 'up', character: 'leap' },
  { id: 'seventh-updown', name: 'Seventh up and down', offsets: [0, 2, 4, 6, 4, 2], tier: 'hard', sequenceable: false, direction: 'arch', character: 'leap' },
  { id: 'seventh-down', name: 'Seventh chord down', offsets: [6, 4, 2, 0], tier: 'hard', sequenceable: true, direction: 'down', character: 'leap' },
  { id: 'triad-octave', name: 'Triad to the octave', offsets: [0, 2, 4, 7], tier: 'hard', sequenceable: false, direction: 'up', character: 'leap' },
  { id: 'arpeggio', name: 'Arpeggio', offsets: [0, 2, 4, 7, 4, 2], tier: 'hard', sequenceable: false, direction: 'arch', character: 'leap' },
  { id: 'broken-fourths', name: 'Broken fourths', offsets: [0, 3, 1, 4], tier: 'hard', sequenceable: true, direction: 'up', character: 'leap' },
  { id: 'broken-fifths', name: 'Broken fifths', offsets: [0, 4, 1, 5], tier: 'hard', sequenceable: true, direction: 'up', character: 'leap' },
  { id: 'broken-sixths', name: 'Broken sixths', offsets: [0, 5, 1, 6], tier: 'hard', sequenceable: true, direction: 'up', character: 'leap' },
  { id: 'octave-leap', name: 'Octave leap', offsets: [0, 7, 0], tier: 'hard', sequenceable: false, direction: 'arch', character: 'leap' },
]

const TIER_ORDER: Record<StaffJumperDifficulty, number> = { easy: 0, medium: 1, hard: 2 }

/** Harder settings inherit everything the easier ones offer. */
export function patternsForDifficulty(difficulty: StaffJumperDifficulty): ScalePattern[] {
  return SCALE_PATTERNS.filter((pattern) => TIER_ORDER[pattern.tier] <= TIER_ORDER[difficulty])
}

export interface PatternStep {
  degree: number
  patternId: string
  patternName: string
}

const widestStepCache = new Map<string, number>()

/**
 * The widest interval printed inside the shape.
 *
 * Only the intervals the shape actually contains — a four-note run is stepwise
 * and a seventh chord is a stack of thirds, whatever they may add up to end to
 * end. Repeating a shape up the scale does create one more interval at the
 * join, but that is a property of the sequencing rather than of the shape, and
 * folding it in here banned scalar runs from exactly the fast easy passages
 * they belong in.
 */
export function widestStepInPattern(pattern: ScalePattern): number {
  const cached = widestStepCache.get(pattern.id)
  if (cached !== undefined) return cached

  let widest = 0
  for (let index = 1; index < pattern.offsets.length; index += 1) {
    widest = Math.max(widest, Math.abs(pattern.offsets[index]! - pattern.offsets[index - 1]!))
  }
  widestStepCache.set(pattern.id, widest)
  return widest
}

/** The interval created where a repeated shape rejoins itself. */
function sequenceSeamInterval(pattern: ScalePattern, direction: number): number {
  const head = pattern.offsets[0] ?? 0
  const tail = pattern.offsets.at(-1) ?? 0
  return Math.abs(head + direction - tail)
}

function offsetRange(pattern: ScalePattern): { min: number; max: number } {
  return {
    min: Math.min(...pattern.offsets),
    max: Math.max(...pattern.offsets),
  }
}

/** Starting degrees that keep every note of the pattern inside the range. */
function validStarts(pattern: ScalePattern, topDegree: number): number[] {
  const { min, max } = offsetRange(pattern)
  const lowest = -min
  const highest = topDegree - max
  if (highest < lowest) return []
  return Array.from({ length: highest - lowest + 1 }, (_, index) => lowest + index)
}

export interface ExerciseBlockOptions {
  difficulty: StaffJumperDifficulty
  topDegree: number
  rng: () => number
  /** Last degree already emitted, so a block can start somewhere sensible. */
  previousDegree: number
  /** Pattern used by the previous block, so the next one can answer it. */
  previousPattern: ScalePattern | null
  /**
   * Widest interval this block may contain or arrive by.
   *
   * Applied to the vocabulary rather than to the notes afterwards: a shape is
   * either playable at this speed on this instrument or it is not offered, so
   * the exercise keeps whole musical figures instead of flattened ones.
   */
  maxLeap: number
  /**
   * Degree the phrase's contour wants this block to sit near.
   *
   * The block still starts wherever the range allows, but pulled towards this
   * rather than towards a random wander — which is the difference between a
   * line that rises to a peak and one that mills about.
   */
  targetDegree: number
}

/**
 * How well one shape answers another.
 *
 * The rules here are the ordinary ones melodies obey. A gesture that travels
 * in one direction is answered by one travelling back; a leap is recovered by
 * stepwise motion; a decoration wants a real gesture after it rather than
 * another decoration. None of this is enforced — it weights the draw, so the
 * exercise still varies, it just stops reading as a shuffle.
 */
function successionWeight(previous: ScalePattern | null, candidate: ScalePattern): number {
  if (!previous) return 1

  let weight = 1
  const travels = (direction: PatternDirection) => direction === 'up' || direction === 'down'

  if (travels(previous.direction) && travels(candidate.direction)) {
    // Contrary motion answers; carrying straight on merely continues.
    weight *= previous.direction === candidate.direction ? 0.5 : 3
  }
  // An arch already comes back on itself, so a second one goes nowhere.
  if (previous.direction === 'arch' && candidate.direction === 'arch') weight *= 0.4

  if (previous.character === 'ornament') {
    weight *= candidate.character === 'ornament' ? 0.15 : 1.6
  }
  if (previous.character === 'leap') {
    // Wide intervals want filling in afterwards, not piling up.
    weight *= candidate.character === 'step' ? 1.5 : 0.6
  }

  return weight
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

/**
 * One block of the exercise: a pattern, placed on a starting degree, sometimes
 * repeated as a rising or falling sequence.
 *
 * Sequencing is what makes this read as an exercise rather than a shuffle — a
 * triad on the tonic, then on the second, then on the third is exactly how the
 * shape is drilled in practice.
 */
export function buildExerciseBlock(options: ExerciseBlockOptions): PatternStep[] {
  const { difficulty, topDegree, rng, previousDegree, previousPattern, targetDegree, maxLeap } =
    options
  const inRange = patternsForDifficulty(difficulty).filter(
    (pattern) => validStarts(pattern, topDegree).length > 0,
  )
  if (inRange.length === 0) return []

  // Drop shapes that are too wide for these notes. If nothing survives — very
  // fast notes on a tight instrument — fall back to the narrowest shapes there
  // are rather than giving up on the block.
  const playable = inRange.filter((pattern) => widestStepInPattern(pattern) <= maxLeap)
  const narrowest = Math.min(...inRange.map(widestStepInPattern))
  const candidates =
    playable.length > 0
      ? playable
      : inRange.filter((pattern) => widestStepInPattern(pattern) === narrowest)

  // Avoid running the same shape twice in a row when there is an alternative.
  const fresh = candidates.filter((pattern) => pattern.id !== previousPattern?.id)
  const pool = fresh.length > 0 ? fresh : candidates
  const pattern = pickWeighted(pool, (candidate) => successionWeight(previousPattern, candidate), rng)

  const starts = validStarts(pattern, topDegree)
  // Aim at the contour's target, but let the line stay joined to where the
  // last block left off — split the difference between the two.
  //
  // What is aimed is the shape's *first sounded note*, not its start degree.
  // A descending shape like [3, 2, 1, 0] begins on its highest offset, so
  // placing its start on the target would enter a third above it — which is
  // how a phrase ending low was being answered by a leap of a tenth.
  const firstOffset = pattern.offsets[0] ?? 0
  const aim = (targetDegree + previousDegree) / 2 - firstOffset
  const nearest = starts.reduce((best, start) =>
    Math.abs(start - aim) < Math.abs(best - aim) ? start : best,
  )
  const jitter = Math.floor(rng() * 3) - 1
  const aimed = starts[Math.max(0, Math.min(starts.length - 1, starts.indexOf(nearest) + jitter))]!

  // The join into this block is a melodic interval like any other, and it is
  // the one the old code never looked at — which is how a stepwise easy-mode
  // exercise could still hand the player a tenth between two shapes.
  const reachable = starts.filter(
    (candidate) => Math.abs(candidate + firstOffset - previousDegree) <= maxLeap,
  )
  const start =
    reachable.length > 0
      ? reachable.reduce((best, candidate) =>
          Math.abs(candidate - aimed) < Math.abs(best - aimed) ? candidate : best,
        )
      : starts.reduce((best, candidate) =>
          Math.abs(candidate + firstOffset - previousDegree) <
          Math.abs(best + firstOffset - previousDegree)
            ? candidate
            : best,
        )

  const steps: PatternStep[] = []
  /**
   * Skip a degree that repeats the one before it.
   *
   * Sequenced patterns overlap at the seam — a neighbour figure ending on its
   * lower note starts the next repetition on that same note — and a restruck
   * unison reads as a stutter rather than an exercise.
   */
  const emit = (degree: number) => {
    if (steps.at(-1)?.degree === degree) return
    steps.push({ degree, patternId: pattern.id, patternName: pattern.name })
  }

  const wanted = rng() > 0.5 ? 1 : -1
  // Repeating the shape adds one interval the printed figure does not contain.
  // Prefer the direction the draw wanted, take the other if only it fits, and
  // fall back to stating the shape once rather than forcing a join too wide
  // for these notes.
  const direction = sequenceSeamInterval(pattern, wanted) <= maxLeap ? wanted : -wanted
  const seamFits = sequenceSeamInterval(pattern, direction) <= maxLeap
  const sequenceLength =
    pattern.sequenceable && seamFits && rng() > 0.45 ? 2 + Math.floor(rng() * 3) : 1

  for (let repeat = 0; repeat < sequenceLength; repeat += 1) {
    const shifted = start + repeat * direction
    if (!starts.includes(shifted)) break
    for (const offset of pattern.offsets) emit(shifted + offset)
  }

  return steps
}

/**
 * How a phrase ends.
 *
 * `open` lands on the dominant — the ear hears a question and expects an
 * answer. `closed` lands on the tonic and settles. Alternating the two is what
 * turns a stream of exercises into antecedent and consequent: a pair of
 * phrases that belong together rather than two that merely follow each other.
 */
export type PhraseCadence = 'open' | 'closed'

/** Scale degrees, mod 7, that a phrase is allowed to finish on. */
const CADENCE_DEGREE_CLASS: Record<PhraseCadence, number> = {
  open: 4,
  closed: 0,
}

/**
 * The shape a phrase traces between its first and last note.
 *
 * An arch is the commonest melodic shape there is — rise to a peak, fall back
 * — so it is weighted accordingly, with plain ascents and descents behind it.
 */
type PhraseContour = 'arch' | 'rise' | 'fall'

const CONTOUR_WEIGHTS: readonly (readonly [PhraseContour, number])[] = [
  ['arch', 3],
  ['rise', 1],
  ['fall', 1.5],
]

function contourDegree(contour: PhraseContour, progress: number, topDegree: number): number {
  const span = Math.max(1, topDegree - 1)
  switch (contour) {
    case 'rise':
      return progress * span
    case 'fall':
      return span - progress * span
    case 'arch':
    default:
      return Math.sin(Math.PI * progress) * span
  }
}

/** The degree of the wanted class that lies closest to where the line already is. */
function nearestDegreeOfClass(near: number, degreeClass: number, topDegree: number): number {
  let best = degreeClass
  let bestDistance = Number.POSITIVE_INFINITY
  for (let degree = degreeClass; degree <= topDegree; degree += 7) {
    const distance = Math.abs(degree - near)
    if (distance < bestDistance) {
      bestDistance = distance
      best = degree
    }
  }
  return best
}

export interface PhraseOptions {
  difficulty: StaffJumperDifficulty
  topDegree: number
  rng: () => number
  /** Exactly how many sounded notes the phrase's bars have room for. */
  noteCount: number
  /** Degree the previous phrase finished on, so this one continues from it. */
  startDegree: number
  cadence: PhraseCadence
  previousPatternId: string | null
  /** Written length of each note the phrase has room for, in sixteenths. */
  noteDurations: readonly number[]
  instrument: TunerInstrument
}

/**
 * One phrase: a contour, filled with answering pattern shapes, that arrives.
 *
 * The note count is dictated by the rhythm rather than chosen here — the bars
 * of the phrase are already drawn, and this fills exactly the notes they hold.
 * That is what makes the arrival land: the phrase's last degree is also the
 * note the closing bar gives a long value to, so the melodic and rhythmic
 * arrivals are the same event instead of two that cut across each other.
 */
export function buildPhraseSteps(options: PhraseOptions): PatternStep[] {
  const { difficulty, topDegree, rng, noteCount, startDegree, cadence } = options
  if (noteCount <= 0) return []

  const { noteDurations, instrument } = options

  /**
   * The cap for a block starting here, taken over the notes it is likely to
   * cover. A shape is chosen once but spans several notes, so it has to suit
   * the quickest of them rather than the first.
   */
  const capAt = (position: number) => {
    const window = noteDurations.slice(Math.max(0, position - 1), position + 4)
    const shortest = window.length > 0 ? Math.min(...window) : 4
    return maxLeapDegrees(difficulty, instrument, shortest)
  }

  const contour = pickWeighted(CONTOUR_WEIGHTS, ([, weight]) => weight, rng)[0]

  /**
   * Where the phrase is going to land, decided before a note is written.
   *
   * The contour says where the line ends up; snapping that to the nearest
   * stable degree gives the arrival. Knowing it up front is what lets the
   * phrase *head for* the cadence over its closing notes instead of being
   * yanked onto it at the last moment — which is how a stepwise easy line
   * ended up leaping a fourth into its own final note.
   */
  const cadenceDegree = nearestDegreeOfClass(
    contourDegree(contour, 1, topDegree),
    CADENCE_DEGREE_CLASS[cadence],
    topDegree,
  )

  const steps: PatternStep[] = []
  let previousPattern: ScalePattern | null =
    SCALE_PATTERNS.find((pattern) => pattern.id === options.previousPatternId) ?? null

  // Blocks come in whole shapes, so the last one usually overshoots and gets
  // trimmed. The guard is only a backstop: a block that fits the range always
  // emits at least one note, so this cannot spin.
  let guard = 0
  while (steps.length < noteCount && guard < 32) {
    guard += 1
    const progress = steps.length / noteCount
    // Past the two-thirds mark the contour gives way to the cadence, so the
    // closing shapes are already chosen to sit near where the phrase lands.
    const homing = Math.max(0, (progress - 0.62) / 0.38)
    const block = buildExerciseBlock({
      difficulty,
      topDegree,
      rng,
      previousDegree: steps.at(-1)?.degree ?? startDegree,
      previousPattern,
      targetDegree:
        contourDegree(contour, progress, topDegree) * (1 - homing) + cadenceDegree * homing,
      maxLeap: capAt(steps.length),
    })
    if (block.length === 0) break
    previousPattern = SCALE_PATTERNS.find((pattern) => pattern.id === block[0]!.patternId) ?? null
    // Never restate the note the line is already sitting on.
    const joined =
      block[0]!.degree === (steps.at(-1)?.degree ?? startDegree) ? block.slice(1) : block
    steps.push(...joined)
  }

  if (steps.length === 0) return []
  steps.length = Math.min(steps.length, noteCount)

  // The arrival itself. Leading the line into it is the caller's job — it owns
  // the note lengths, so it is the only place that knows how far the phrase is
  // allowed to move on each of its closing notes.
  steps[steps.length - 1] = { ...steps.at(-1)!, degree: cadenceDegree }

  return steps
}
