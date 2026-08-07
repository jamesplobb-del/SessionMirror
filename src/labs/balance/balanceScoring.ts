import type {
  BalanceDriftDirection,
  BalanceNoteResult,
  BalancePitchSample,
  BalanceTarget,
} from './balanceTypes'

export const BALANCE_PITCH_LOCK_MS = 250
export const BALANCE_DROPOUT_GRACE_MS = 650
export const BALANCE_MAX_SAMPLE_GAP_MS = 180

export type BalanceToleranceClass = 'centered' | 'steady' | 'edge' | 'outside'

export interface BalanceScoreAccumulator {
  target: BalanceTarget
  toleranceCents: number
  samples: BalancePitchSample[]
  totalConfidentMs: number
  balancedMs: number
  longestCenteredMs: number
  currentCenteredMs: number
  weightedSignedCents: number
  weightedAbsoluteCents: number
  weightedDurationMs: number
  sharpestCents: number
  flattestCents: number
  lastSample: BalancePitchSample | null
}

export function classifyBalanceCents(
  cents: number,
  toleranceCents: number,
): BalanceToleranceClass {
  const absolute = Math.abs(cents)
  if (absolute <= 3) return 'centered'
  if (absolute <= toleranceCents * 0.7) return 'steady'
  if (absolute <= toleranceCents) return 'edge'
  return 'outside'
}

export function movementSpeedForCents(cents: number, toleranceCents: number): number {
  const classification = classifyBalanceCents(cents, toleranceCents)
  if (classification === 'centered') return 1
  if (classification === 'steady') {
    const span = Math.max(1, toleranceCents * 0.7 - 3)
    return 0.82 - ((Math.abs(cents) - 3) / span) * 0.22
  }
  if (classification === 'edge') {
    const span = Math.max(1, toleranceCents * 0.3)
    return 0.42 - ((Math.abs(cents) - toleranceCents * 0.7) / span) * 0.24
  }
  return 0
}

export function createBalanceScoreAccumulator(
  target: BalanceTarget,
  toleranceCents: number,
): BalanceScoreAccumulator {
  return {
    target,
    toleranceCents,
    samples: [],
    totalConfidentMs: 0,
    balancedMs: 0,
    longestCenteredMs: 0,
    currentCenteredMs: 0,
    weightedSignedCents: 0,
    weightedAbsoluteCents: 0,
    weightedDurationMs: 0,
    sharpestCents: Number.NEGATIVE_INFINITY,
    flattestCents: Number.POSITIVE_INFINITY,
    lastSample: null,
  }
}

export function addBalancePitchSample(
  accumulator: BalanceScoreAccumulator,
  sample: BalancePitchSample,
): void {
  const previous = accumulator.lastSample
  accumulator.samples.push(sample)
  accumulator.lastSample = sample
  accumulator.sharpestCents = Math.max(accumulator.sharpestCents, sample.centsFromTarget)
  accumulator.flattestCents = Math.min(accumulator.flattestCents, sample.centsFromTarget)

  if (!previous) return
  const elapsed = Math.max(0, sample.timestamp - previous.timestamp)
  if (elapsed > BALANCE_DROPOUT_GRACE_MS) {
    accumulator.currentCenteredMs = 0
    return
  }

  const duration = Math.min(elapsed, BALANCE_MAX_SAMPLE_GAP_MS)
  accumulator.totalConfidentMs += duration
  accumulator.weightedDurationMs += duration
  accumulator.weightedSignedCents += sample.centsFromTarget * duration
  accumulator.weightedAbsoluteCents += Math.abs(sample.centsFromTarget) * duration

  if (Math.abs(sample.centsFromTarget) <= accumulator.toleranceCents) {
    accumulator.balancedMs += duration
    accumulator.currentCenteredMs += duration
    accumulator.longestCenteredMs = Math.max(
      accumulator.longestCenteredMs,
      accumulator.currentCenteredMs,
    )
  } else {
    accumulator.currentCenteredMs = 0
  }
}

function computeDrift(samples: readonly BalancePitchSample[]): BalanceDriftDirection {
  if (samples.length < 12) return null
  const firstAt = samples[0]!.timestamp
  const durationSeconds = (samples[samples.length - 1]!.timestamp - firstAt) / 1000
  if (durationSeconds < 1.5) return null

  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0
  for (const sample of samples) {
    const x = (sample.timestamp - firstAt) / 1000
    const y = sample.centsFromTarget
    sumX += x
    sumY += y
    sumXY += x * y
    sumXX += x * x
  }
  const count = samples.length
  const denominator = count * sumXX - sumX * sumX
  if (Math.abs(denominator) < 0.0001) return null
  const slope = (count * sumXY - sumX * sumY) / denominator
  if (Math.abs(slope) < 1) return null
  return slope > 0 ? 'sharpward' : 'flatward'
}

export function finalizeBalanceScore(
  accumulator: BalanceScoreAccumulator,
  goalReached: boolean,
  completedAt = Date.now(),
): BalanceNoteResult {
  const duration = accumulator.weightedDurationMs
  const centeredPercent =
    accumulator.totalConfidentMs > 0
      ? (accumulator.balancedMs / accumulator.totalConfidentMs) * 100
      : 0
  return {
    target: accumulator.target,
    toleranceCents: accumulator.toleranceCents,
    totalConfidentMs: accumulator.totalConfidentMs,
    balancedMs: accumulator.balancedMs,
    centeredPercent,
    longestCenteredMs: accumulator.longestCenteredMs,
    signedAverageCents: duration > 0 ? accumulator.weightedSignedCents / duration : 0,
    averageAbsoluteCents: duration > 0 ? accumulator.weightedAbsoluteCents / duration : 0,
    sharpestCents: Number.isFinite(accumulator.sharpestCents) ? accumulator.sharpestCents : 0,
    flattestCents: Number.isFinite(accumulator.flattestCents) ? accumulator.flattestCents : 0,
    driftDirection: computeDrift(accumulator.samples),
    goalReached,
    completedAt,
  }
}

export function centsFromConcertTarget(
  detectedMidi: number,
  detectedCents: number,
  targetConcertMidi: number,
): number {
  return (Math.round(detectedMidi) - Math.round(targetConcertMidi)) * 100 + detectedCents
}

export function isTargetPitch(centsFromTarget: number): boolean {
  return Math.abs(centsFromTarget) < 50
}
