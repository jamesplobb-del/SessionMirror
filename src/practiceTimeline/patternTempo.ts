import { resolvePulseTiming } from '../metronome/pulseResolution'
import type { PulseUnit } from '../metronome/timeSignatureDefinitions'
import type { MeterPatternStep, TimelineSection } from './types'

/** Sixteenth-note units per conducting pulse (quarter = 120 → 480 sixteenths/min). */
const SIXTEENTHS_PER_PULSE: Record<PulseUnit, number> = {
  sixteenth: 1,
  eighth: 2,
  quarter: 4,
  'dotted-quarter': 6,
  half: 8,
  'dotted-half': 12,
}

function clampBeatBpm(value: number): number {
  return Math.max(40, Math.min(300, Math.round(value)))
}

export function sixteenthsPerMinuteFromCanonicalQuarter(canonicalQuarterBpm: number): number {
  return canonicalQuarterBpm * 4
}

/** Beat BPM for a pulse unit when the section master tempo is quarter-note BPM. */
export function beatBpmFromCanonicalQuarter(
  canonicalQuarterBpm: number,
  pulseUnit: PulseUnit,
): number {
  const sixteenthsPerMinute = sixteenthsPerMinuteFromCanonicalQuarter(canonicalQuarterBpm)
  return clampBeatBpm(sixteenthsPerMinute / SIXTEENTHS_PER_PULSE[pulseUnit])
}

/** Inverse: derive canonical quarter BPM from a step's stored beat BPM (legacy data). */
export function canonicalQuarterFromBeatBpm(beatBpm: number, pulseUnit: PulseUnit): number {
  const sixteenthsPerMinute = beatBpm * SIXTEENTHS_PER_PULSE[pulseUnit]
  return clampBeatBpm(sixteenthsPerMinute / 4)
}

export function resolvePatternStepPulseUnit(step: MeterPatternStep): PulseUnit {
  return resolvePulseTiming({
    meter: step.meter,
    pulseModeId: step.pulseModeId,
    feelId: step.feelId,
    beatGrouping: step.beatGrouping,
    customAccents: step.customAccents,
  }).pulseUnit
}

/** Playback/display BPM for one pattern step from the section's master quarter tempo. */
export function derivePatternStepBpm(canonicalQuarterBpm: number, step: MeterPatternStep): number {
  return beatBpmFromCanonicalQuarter(canonicalQuarterBpm, resolvePatternStepPulseUnit(step))
}

/** Ensure pattern sections use section.bpm as the single master tempo. */
export function normalizePatternSectionTempo(section: TimelineSection): TimelineSection {
  const steps = section.patternSteps
  if (!steps?.length) return section

  let canonical = clampBeatBpm(section.bpm)
  const first = steps[0]
  if (first.bpm !== undefined && first.bpm > 0) {
    const fromFirst = canonicalQuarterFromBeatBpm(first.bpm, resolvePatternStepPulseUnit(first))
    if (canonical <= 0) canonical = fromFirst
  }

  const patternSteps = steps.map(({ bpm: _legacyBpm, ...step }) => step)

  return {
    ...section,
    bpm: canonical,
    patternSteps,
  }
}
