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
import type { StaffJumperDifficulty } from './staffJumperMusicLogic'

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
  const { difficulty, topDegree, rng, previousDegree, previousPattern, targetDegree } = options
  const candidates = patternsForDifficulty(difficulty).filter(
    (pattern) => validStarts(pattern, topDegree).length > 0,
  )
  if (candidates.length === 0) return []

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
  const aim = (targetDegree + previousDegree) / 2 - (pattern.offsets[0] ?? 0)
  const nearest = starts.reduce((best, start) =>
    Math.abs(start - aim) < Math.abs(best - aim) ? start : best,
  )
  const jitter = Math.floor(rng() * 3) - 1
  const startIndex = Math.max(0, Math.min(starts.length - 1, starts.indexOf(nearest) + jitter))
  const start = starts[startIndex]!

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

  const sequenceLength =
    pattern.sequenceable && rng() > 0.45 ? 2 + Math.floor(rng() * 3) : 1
  const direction = rng() > 0.5 ? 1 : -1

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

  const contour = pickWeighted(CONTOUR_WEIGHTS, ([, weight]) => weight, rng)[0]
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
    const block = buildExerciseBlock({
      difficulty,
      topDegree,
      rng,
      previousDegree: steps.at(-1)?.degree ?? startDegree,
      previousPattern,
      targetDegree: contourDegree(contour, progress, topDegree),
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

  // ── The cadence ──
  // Bend the final note onto a stable degree, and approach it by step. A
  // phrase that arrives by leap onto the tonic sounds cut off; the step down
  // from the supertonic, or up from the leading tone, is what makes it land.
  const last = steps.at(-1)!
  const finalDegree = nearestDegreeOfClass(
    last.degree,
    CADENCE_DEGREE_CLASS[cadence],
    topDegree,
  )
  steps[steps.length - 1] = { ...last, degree: finalDegree }

  const penultimate = steps.at(-2)
  if (penultimate) {
    const gap = penultimate.degree - finalDegree
    if (gap === 0 || Math.abs(gap) > 2) {
      // Approach from whichever side the line was already on, falling back to
      // the other when the range or the note before rules it out. Both
      // exclusions matter: landing on the cadence degree would make the
      // arrival a restatement, and matching the note before it would put a
      // repeated note immediately in front of the cadence.
      const above = Math.min(topDegree, finalDegree + 1)
      const below = Math.max(0, finalDegree - 1)
      const ordered = gap > 0 ? [above, below] : [below, above]
      const before = steps.at(-3)?.degree
      const approach =
        ordered.find((candidate) => candidate !== finalDegree && candidate !== before) ??
        ordered.find((candidate) => candidate !== finalDegree) ??
        penultimate.degree
      steps[steps.length - 2] = { ...penultimate, degree: approach }
    }
  }

  return steps
}
