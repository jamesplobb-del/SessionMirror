/** Weighted random note picker for scale-based arcade games. */

export interface NoteGeneratorWeights {
  /** Multiplier applied when candidate equals the previous note (lower = less repetition). */
  samePitchPenalty: number
  /** Exponent applied to semitone distance — higher values favor larger interval jumps. */
  intervalBias: number
  /** Baseline weight for every candidate in the pool. */
  baseWeight: number
}

export const DEFAULT_NOTE_GENERATOR_WEIGHTS: NoteGeneratorWeights = {
  samePitchPenalty: 0.08,
  intervalBias: 1.35,
  baseWeight: 1,
}

function weightedPick(candidates: Array<{ midi: number; weight: number }>, random: () => number): number {
  const total = candidates.reduce((sum, item) => sum + item.weight, 0)
  if (total <= 0 || candidates.length === 0) {
    throw new Error('Note generator received an empty candidate pool')
  }

  let roll = random() * total
  for (const candidate of candidates) {
    roll -= candidate.weight
    if (roll <= 0) return candidate.midi
  }

  return candidates[candidates.length - 1]!.midi
}

export function pickWeightedScaleNote(
  pool: readonly number[],
  previousMidi: number | null,
  weights: NoteGeneratorWeights = DEFAULT_NOTE_GENERATOR_WEIGHTS,
  random: () => number = Math.random,
): number {
  if (pool.length === 0) {
    throw new Error('Scale note pool is empty')
  }
  if (pool.length === 1) return pool[0]!

  const candidates = pool.map((midi) => {
    let weight = weights.baseWeight

    if (previousMidi != null && midi === previousMidi) {
      weight *= weights.samePitchPenalty
    } else if (previousMidi != null) {
      const semitones = Math.abs(midi - previousMidi)
      weight *= 1 + (semitones / 12) ** weights.intervalBias
    }

    return { midi, weight: Math.max(weight, 0.001) }
  })

  return weightedPick(candidates, random)
}
