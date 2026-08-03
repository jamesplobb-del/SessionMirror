import type { SavePitchObservationInput } from '../db/pitchInsightsRepository'

/** Stable-note thresholds are intentionally centralized for real-world tuning. */
export const STABLE_NOTE_THRESHOLDS = {
  attackIgnoreMs: 240,
  minimumEventDurationMs: 720,
  minimumStableWindowMs: 420,
  minimumStableSamples: 8,
  minimumSampleIntervalMs: 45,
  minimumConfidence: 0.7,
  maximumFrameGapMs: 420,
  maximumAbsoluteCents: 48,
  minimumOutlierBandCents: 4.5,
  maximumOutlierBandCents: 14,
  maximumVariabilityCents: 14,
} as const

export interface StablePitchFrame {
  midiNote: number
  noteName: string
  centsOffset: number
  frequencyHz: number
  confidence: number
  /** Unix epoch milliseconds. */
  timestamp: number
}

export interface StablePitchContext {
  tunerInstrument: string
  transpositionId: string
  sessionId?: string | null
}

interface CandidateSample {
  cents: number
  confidence: number
  timestamp: number
}

interface StableNoteCandidate {
  midiNote: number
  noteName: string
  startedAt: number
  lastAt: number
  context: StablePitchContext
  samples: CandidateSample[]
}

export type StableObservationHandler = (
  observation: SavePitchObservationInput,
) => void | Promise<void>

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

function standardDeviation(values: number[], center: number): number {
  if (values.length < 2) return 0
  const variance = values.reduce((sum, value) => sum + (value - center) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function contextsMatch(left: StablePitchContext, right: StablePitchContext): boolean {
  return (
    left.tunerInstrument === right.tunerInstrument &&
    left.transpositionId === right.transpositionId &&
    (left.sessionId ?? null) === (right.sessionId ?? null)
  )
}

function octaveForMidi(midiNote: number): number {
  return Math.floor(Math.round(midiNote) / 12) - 1
}

function validFrame(frame: StablePitchFrame): boolean {
  return (
    frame.noteName !== '—' &&
    Number.isFinite(frame.midiNote) &&
    Number.isFinite(frame.centsOffset) &&
    Number.isFinite(frame.frequencyHz) &&
    frame.frequencyHz > 0 &&
    Number.isFinite(frame.confidence) &&
    frame.confidence >= STABLE_NOTE_THRESHOLDS.minimumConfidence &&
    Math.abs(frame.centsOffset) <= STABLE_NOTE_THRESHOLDS.maximumAbsoluteCents
  )
}

/**
 * Converts the tuner's already-vetted frames into one robust observation per
 * sustained note. It performs no pitch detection and retains no raw audio.
 */
export class StableNoteTracker {
  private candidate: StableNoteCandidate | null = null
  private readonly onObservation: StableObservationHandler

  constructor(onObservation: StableObservationHandler) {
    this.onObservation = onObservation
  }

  ingest(frame: StablePitchFrame | null, context: StablePitchContext): void {
    if (!frame || !validFrame(frame)) {
      this.finish()
      return
    }

    const roundedMidi = Math.round(frame.midiNote)
    const current = this.candidate
    const startsNewNote =
      !current ||
      current.midiNote !== roundedMidi ||
      !contextsMatch(current.context, context) ||
      frame.timestamp - current.lastAt > STABLE_NOTE_THRESHOLDS.maximumFrameGapMs

    if (startsNewNote) {
      this.finish()
      this.candidate = {
        midiNote: roundedMidi,
        noteName: frame.noteName,
        startedAt: frame.timestamp,
        lastAt: frame.timestamp,
        context: { ...context },
        samples: [],
      }
      return
    }

    current.lastAt = frame.timestamp
    current.noteName = frame.noteName
    if (frame.timestamp - current.startedAt < STABLE_NOTE_THRESHOLDS.attackIgnoreMs) return
    const previousSample = current.samples[current.samples.length - 1]
    if (
      previousSample &&
      frame.timestamp - previousSample.timestamp < STABLE_NOTE_THRESHOLDS.minimumSampleIntervalMs
    ) {
      return
    }

    current.samples.push({
      cents: frame.centsOffset,
      confidence: frame.confidence,
      timestamp: frame.timestamp,
    })
  }

  finish(): void {
    const candidate = this.candidate
    this.candidate = null
    if (!candidate) return

    const durationMs = candidate.lastAt - candidate.startedAt
    if (durationMs < STABLE_NOTE_THRESHOLDS.minimumEventDurationMs) return
    if (candidate.samples.length < STABLE_NOTE_THRESHOLDS.minimumStableSamples) return

    const firstStableAt = candidate.samples[0]?.timestamp ?? candidate.lastAt
    const stableWindowMs = candidate.lastAt - firstStableAt
    if (stableWindowMs < STABLE_NOTE_THRESHOLDS.minimumStableWindowMs) return

    const centsValues = candidate.samples.map((sample) => sample.cents)
    const initialMedian = median(centsValues)
    const medianAbsoluteDeviation = median(
      centsValues.map((value) => Math.abs(value - initialMedian)),
    )
    const outlierBand = Math.max(
      STABLE_NOTE_THRESHOLDS.minimumOutlierBandCents,
      Math.min(
        STABLE_NOTE_THRESHOLDS.maximumOutlierBandCents,
        medianAbsoluteDeviation * 3.5,
      ),
    )
    const filtered = candidate.samples.filter(
      (sample) => Math.abs(sample.cents - initialMedian) <= outlierBand,
    )
    if (filtered.length < STABLE_NOTE_THRESHOLDS.minimumStableSamples) return

    const representativeCents = median(filtered.map((sample) => sample.cents))
    const variabilityCents = standardDeviation(
      filtered.map((sample) => sample.cents),
      representativeCents,
    )
    if (variabilityCents > STABLE_NOTE_THRESHOLDS.maximumVariabilityCents) return

    const representativeConfidence = median(filtered.map((sample) => sample.confidence))
    if (representativeConfidence < STABLE_NOTE_THRESHOLDS.minimumConfidence) return

    void this.onObservation({
      midiNote: candidate.midiNote,
      noteName: candidate.noteName,
      octave: octaveForMidi(candidate.midiNote),
      centsOffset: representativeCents,
      observedAt: candidate.lastAt,
      durationMs,
      sampleCount: filtered.length,
      variabilityCents,
      tunerInstrument: candidate.context.tunerInstrument,
      transpositionId: candidate.context.transpositionId,
      sessionId: candidate.context.sessionId ?? null,
    })
  }
}
