import type { MetronomeClickTier, MetronomeSubdivision } from './metronomeTypes'
import {
  getAccentLevelsForMeter,
  getTimeSignatureDefinition,
  type MetronomeAccentLevel,
  type MetronomeMeter,
} from './timeSignatureDefinitions'

export type { MetronomeClickTier } from './metronomeTypes'

export interface MetronomeTimingState {
  meter: MetronomeMeter
  subdivision: MetronomeSubdivision
  accentLevels: MetronomeAccentLevel[]
}

export interface ResolvedUiTick {
  beatIndex: number
  subTickIndex: number
}

function smallestNoteUnitsPerBar(meter: MetronomeMeter): number {
  const def = getTimeSignatureDefinition(meter)
  return def.numerator * (16 / def.denominator)
}

function smallestNoteUnitsPerPulse(meter: MetronomeMeter): number {
  const def = getTimeSignatureDefinition(meter)
  return smallestNoteUnitsPerBar(meter) / def.pulseCount
}

/** Scheduler ticks within one conducting pulse for the current subdivision. */
export function ticksPerPulse(meter: MetronomeMeter, subdivision: MetronomeSubdivision): number {
  if (subdivision === 'off') return 1

  if (
    subdivision === 'triplets' ||
    subdivision === 'dotted' ||
    subdivision === 'quints' ||
    subdivision === 'septuplets'
  ) {
    switch (subdivision) {
      case 'triplets':
      case 'dotted':
        return 3
      case 'quints':
        return 5
      case 'septuplets':
        return 7
      default:
        return 1
    }
  }

  const naturalUnits = smallestNoteUnitsPerPulse(meter)

  if (subdivision === '8ths') {
    if (naturalUnits <= 2) return 2
    return naturalUnits / 2
  }

  if (subdivision === '16ths') {
    if (naturalUnits <= 2) return 4
    return naturalUnits
  }

  return 1
}

export function ticksPerBar(meter: MetronomeMeter, subdivision: MetronomeSubdivision): number {
  const def = getTimeSignatureDefinition(meter)
  return def.pulseCount * ticksPerPulse(meter, subdivision)
}

/** BPM always refers to the conducting pulse. */
export function secondsPerPulse(bpm: number): number {
  return 60 / bpm
}

export function secondsPerSchedulerTick(
  meter: MetronomeMeter,
  bpm: number,
  subdivision: MetronomeSubdivision,
): number {
  return secondsPerPulse(bpm) / ticksPerPulse(meter, subdivision)
}

export function resolveUiTick(
  meter: MetronomeMeter,
  tickIndexInBar: number,
  subdivision: MetronomeSubdivision,
): ResolvedUiTick {
  const pulseTicks = ticksPerPulse(meter, subdivision)
  const def = getTimeSignatureDefinition(meter)
  const beatIndex = Math.floor(tickIndexInBar / pulseTicks) % def.pulseCount
  const subTickIndex = tickIndexInBar % pulseTicks
  return { beatIndex, subTickIndex }
}

export function accentLevelToClickTier(
  beatIndex: number,
  level: MetronomeAccentLevel,
): MetronomeClickTier {
  if (level === 'weak') return 'subdivision'
  if (level === 'strong' && beatIndex === 0) return 'downbeat'
  return 'macro'
}

export function resolveClickTier(
  state: MetronomeTimingState,
  tickIndexInBar: number,
): MetronomeClickTier {
  const { meter, subdivision, accentLevels } = state
  const pulseTicks = ticksPerPulse(meter, subdivision)
  const tickInPulse = tickIndexInBar % pulseTicks

  if (tickInPulse !== 0) return 'subdivision'

  const { beatIndex } = resolveUiTick(meter, tickIndexInBar, subdivision)
  const level = accentLevels[beatIndex] ?? 'weak'
  return accentLevelToClickTier(beatIndex, level)
}

export function subTicksPerPulse(meter: MetronomeMeter, subdivision: MetronomeSubdivision): number {
  return Math.max(0, ticksPerPulse(meter, subdivision) - 1)
}

export function isSubdivisionAvailable(
  meter: MetronomeMeter,
  subdivision: MetronomeSubdivision,
): boolean {
  return getTimeSignatureDefinition(meter).availableSubdivisions.includes(subdivision)
}

export function suggestSubdivisionForMeterChange(
  nextMeter: MetronomeMeter,
  previousMeter: MetronomeMeter,
  currentSubdivision: MetronomeSubdivision,
): MetronomeSubdivision {
  const nextDef = getTimeSignatureDefinition(nextMeter)
  if (!isSubdivisionAvailable(nextMeter, currentSubdivision)) {
    return nextDef.defaultSubdivision
  }

  const prevDef = getTimeSignatureDefinition(previousMeter)
  if (prevDef.pulseUnit !== nextDef.pulseUnit || prevDef.compound !== nextDef.compound) {
    return nextDef.defaultSubdivision
  }

  return currentSubdivision
}

export function accentLevelsToLegacyPattern(levels: MetronomeAccentLevel[]): boolean[] {
  return levels.map((level) => level !== 'weak')
}

export function legacyPatternToAccentLevels(
  meter: MetronomeMeter,
  pattern: boolean[],
  feelId?: string,
): MetronomeAccentLevel[] {
  const defaults = getTimeSignatureDefinition(meter)
  const pulseCount = defaults.pulseCount
  const defaultLevels =
    pattern.length === pulseCount
      ? pattern.map((accented, index) => {
          if (!accented) return 'weak'
          return index === 0 ? 'strong' : 'medium'
        })
      : getAccentLevelsFromDefaults(meter, feelId)

  return Array.from({ length: pulseCount }, (_, index) => defaultLevels[index] ?? 'weak')
}

export function getAccentLevelsFromDefaults(
  meter: MetronomeMeter,
  feelId?: string,
): MetronomeAccentLevel[] {
  return getAccentLevelsForMeter(meter, feelId)
}

export function cycleAccentLevel(current: MetronomeAccentLevel): MetronomeAccentLevel {
  if (current === 'weak') return 'medium'
  if (current === 'medium') return 'strong'
  return 'weak'
}

export function getPulseLabel(meter: MetronomeMeter): string {
  return getTimeSignatureDefinition(meter).pulseName
}

export function getSubdivisionLabel(
  meter: MetronomeMeter,
  subdivision: MetronomeSubdivision,
): string {
  if (subdivision === 'off') {
    return getTimeSignatureDefinition(meter).pulseName
  }
  switch (subdivision) {
    case '8ths':
      return 'Eighths'
    case 'triplets':
      return 'Triplets'
    case '16ths':
      return 'Sixteenths'
    case 'dotted':
      return 'Dotted'
    case 'quints':
      return 'Quintuplets'
    case 'septuplets':
      return 'Septuplets'
    default:
      return subdivision
  }
}
