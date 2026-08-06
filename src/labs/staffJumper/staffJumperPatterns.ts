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
}

export const SCALE_PATTERNS: readonly ScalePattern[] = [
  // ── Stepwise: the vocabulary every player starts with ──
  { id: 'run-up', name: 'Four-note run', offsets: [0, 1, 2, 3], tier: 'easy', sequenceable: true },
  { id: 'run-down', name: 'Four-note run down', offsets: [3, 2, 1, 0], tier: 'easy', sequenceable: true },
  { id: 'step-back', name: 'Step and back', offsets: [0, 1, 2, 1], tier: 'easy', sequenceable: true },
  { id: 'neighbour', name: 'Neighbour tone', offsets: [0, 1, 0, -1], tier: 'easy', sequenceable: true },
  { id: 'five-up', name: 'Five-note run', offsets: [0, 1, 2, 3, 4], tier: 'easy', sequenceable: true },

  // ── Triads and thirds ──
  { id: 'triad', name: 'Triad', offsets: [0, 2, 4], tier: 'medium', sequenceable: true },
  { id: 'triad-updown', name: 'Triad up and down', offsets: [0, 2, 4, 2], tier: 'medium', sequenceable: true },
  { id: 'triad-down', name: 'Triad down', offsets: [4, 2, 0], tier: 'medium', sequenceable: true },
  { id: 'broken-thirds', name: 'Broken thirds', offsets: [0, 2, 1, 3], tier: 'medium', sequenceable: true },
  { id: 'thirds-run', name: 'Thirds sequence', offsets: [0, 2, 1, 3, 2, 4], tier: 'medium', sequenceable: false },
  { id: 'turn', name: 'Turn', offsets: [0, 1, 0, -1, 0], tier: 'medium', sequenceable: true },
  { id: 'group-1231', name: '1‑2‑3‑1', offsets: [0, 1, 2, 0], tier: 'medium', sequenceable: true },

  // ── Seventh chords, wider intervals, octaves ──
  { id: 'seventh', name: 'Seventh chord', offsets: [0, 2, 4, 6], tier: 'hard', sequenceable: true },
  { id: 'seventh-updown', name: 'Seventh up and down', offsets: [0, 2, 4, 6, 4, 2], tier: 'hard', sequenceable: false },
  { id: 'seventh-down', name: 'Seventh chord down', offsets: [6, 4, 2, 0], tier: 'hard', sequenceable: true },
  { id: 'triad-octave', name: 'Triad to the octave', offsets: [0, 2, 4, 7], tier: 'hard', sequenceable: false },
  { id: 'arpeggio', name: 'Arpeggio', offsets: [0, 2, 4, 7, 4, 2], tier: 'hard', sequenceable: false },
  { id: 'broken-fourths', name: 'Broken fourths', offsets: [0, 3, 1, 4], tier: 'hard', sequenceable: true },
  { id: 'broken-fifths', name: 'Broken fifths', offsets: [0, 4, 1, 5], tier: 'hard', sequenceable: true },
  { id: 'broken-sixths', name: 'Broken sixths', offsets: [0, 5, 1, 6], tier: 'hard', sequenceable: true },
  { id: 'octave-leap', name: 'Octave leap', offsets: [0, 7, 0], tier: 'hard', sequenceable: false },
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
  /** Pattern used by the previous block, to avoid repeating it immediately. */
  previousPatternId: string | null
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
  const { difficulty, topDegree, rng, previousDegree, previousPatternId } = options
  const candidates = patternsForDifficulty(difficulty).filter(
    (pattern) => validStarts(pattern, topDegree).length > 0,
  )
  if (candidates.length === 0) return []

  // Avoid running the same shape twice in a row when there is an alternative.
  const fresh = candidates.filter((pattern) => pattern.id !== previousPatternId)
  const pool = fresh.length > 0 ? fresh : candidates
  const pattern = pool[Math.floor(rng() * pool.length)]!

  const starts = validStarts(pattern, topDegree)
  // Prefer a start near where the last block left off so blocks connect rather
  // than lurching around the staff.
  const nearest = starts.reduce((best, start) =>
    Math.abs(start - previousDegree) < Math.abs(best - previousDegree) ? start : best,
  )
  const wander = Math.floor(rng() * 5) - 2
  const startIndex = Math.max(0, Math.min(starts.length - 1, starts.indexOf(nearest) + wander))
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
