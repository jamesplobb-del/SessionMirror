import type { MetronomeClickTier, MetronomeSubdivision } from './metronomeTypes'
import { getPulseModeById } from './pulseModes'
import type { ResolvedPulseTiming } from './pulseResolution'
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
  /** Conducting pulses per bar — BPM refers to this pulse. */
  pulseCount: number
}

export interface ResolvedUiTick {
  beatIndex: number
  subTickIndex: number
}

function smallestNoteUnitsPerBarFromResolved(resolved: ResolvedPulseTiming): number {
  return resolved.numerator * (16 / resolved.denominator)
}

function smallestNoteUnitsPerBar(meter: MetronomeMeter): number {
  const def = getTimeSignatureDefinition(meter)
  return def.numerator * (16 / def.denominator)
}

function smallestNoteUnitsPerPulse(meter: MetronomeMeter, pulseCount: number): number {
  return smallestNoteUnitsPerBar(meter) / pulseCount
}

function smallestNoteUnitsPerPulseResolved(resolved: ResolvedPulseTiming): number {
  return smallestNoteUnitsPerBarFromResolved(resolved) / resolved.pulseCount
}

function ticksPerPulseInner(
  naturalUnits: number,
  subdivision: MetronomeSubdivision,
): number {
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

/** Scheduler ticks within one conducting pulse for the current subdivision. */
export function ticksPerPulse(
  meter: MetronomeMeter,
  subdivision: MetronomeSubdivision,
  pulseCount?: number,
): number {
  const count = pulseCount ?? getTimeSignatureDefinition(meter).pulseCount
  return ticksPerPulseInner(smallestNoteUnitsPerPulse(meter, count), subdivision)
}

export function ticksPerPulseResolved(
  resolved: ResolvedPulseTiming,
  subdivision: MetronomeSubdivision,
): number {
  return ticksPerPulseInner(smallestNoteUnitsPerPulseResolved(resolved), subdivision)
}

export function ticksPerBar(
  meter: MetronomeMeter,
  subdivision: MetronomeSubdivision,
  pulseCount?: number,
): number {
  const count = pulseCount ?? getTimeSignatureDefinition(meter).pulseCount
  return count * ticksPerPulse(meter, subdivision, count)
}

export function ticksPerBarResolved(
  resolved: ResolvedPulseTiming,
  subdivision: MetronomeSubdivision,
): number {
  return resolved.pulseCount * ticksPerPulseResolved(resolved, subdivision)
}

/** BPM always refers to the conducting pulse. */
export function secondsPerPulse(bpm: number): number {
  return 60 / bpm
}

export function secondsPerSchedulerTick(
  meter: MetronomeMeter,
  bpm: number,
  subdivision: MetronomeSubdivision,
  pulseCount?: number,
): number {
  return secondsPerPulse(bpm) / ticksPerPulse(meter, subdivision, pulseCount)
}

export function secondsPerSchedulerTickResolved(
  resolved: ResolvedPulseTiming,
  bpm: number,
  subdivision: MetronomeSubdivision,
): number {
  return secondsPerPulse(bpm) / ticksPerPulseResolved(resolved, subdivision)
}

export function resolveUiTick(
  meter: MetronomeMeter,
  tickIndexInBar: number,
  subdivision: MetronomeSubdivision,
  pulseCount?: number,
): ResolvedUiTick {
  const count = pulseCount ?? getTimeSignatureDefinition(meter).pulseCount
  const pulseTicks = ticksPerPulse(meter, subdivision, count)
  const beatIndex = Math.floor(tickIndexInBar / pulseTicks) % count
  const subTickIndex = tickIndexInBar % pulseTicks
  return { beatIndex, subTickIndex }
}

export function resolveUiTickResolved(
  resolved: ResolvedPulseTiming,
  tickIndexInBar: number,
  subdivision: MetronomeSubdivision,
): ResolvedUiTick {
  const pulseTicks = ticksPerPulseResolved(resolved, subdivision)
  const beatIndex = Math.floor(tickIndexInBar / pulseTicks) % resolved.pulseCount
  const subTickIndex = tickIndexInBar % pulseTicks
  return { beatIndex, subTickIndex }
}

export function accentLevelToClickTier(
  beatIndex: number,
  level: MetronomeAccentLevel,
): MetronomeClickTier | null {
  if (level === 'silent') return null
  if (level === 'weak') return 'subdivision'
  if (level === 'strong' && beatIndex === 0) return 'downbeat'
  return 'macro'
}

export function resolveClickTier(
  state: MetronomeTimingState,
  tickIndexInBar: number,
): MetronomeClickTier | null {
  const { meter, subdivision, accentLevels, pulseCount } = state
  const pulseTicks = ticksPerPulse(meter, subdivision, pulseCount)
  const tickInPulse = tickIndexInBar % pulseTicks

  if (tickInPulse !== 0) return 'subdivision'

  const { beatIndex } = resolveUiTick(meter, tickIndexInBar, subdivision, pulseCount)
  const level = accentLevels[beatIndex] ?? 'weak'
  return accentLevelToClickTier(beatIndex, level)
}

export function subTicksPerPulse(
  meter: MetronomeMeter,
  subdivision: MetronomeSubdivision,
  pulseCount?: number,
): number {
  return Math.max(0, ticksPerPulse(meter, subdivision, pulseCount) - 1)
}

export function subTicksPerPulseResolved(
  resolved: ResolvedPulseTiming,
  subdivision: MetronomeSubdivision,
): number {
  return Math.max(0, ticksPerPulseResolved(resolved, subdivision) - 1)
}

export function isSubdivisionAvailable(
  meter: MetronomeMeter,
  subdivision: MetronomeSubdivision,
  availableSubdivisions?: MetronomeSubdivision[],
): boolean {
  const list = availableSubdivisions ?? getTimeSignatureDefinition(meter).availableSubdivisions
  return list.includes(subdivision)
}

export function suggestSubdivisionForMeterChange(
  nextMeter: MetronomeMeter,
  previousMeter: MetronomeMeter,
  currentSubdivision: MetronomeSubdivision,
  nextPulseModeId?: string,
  prevPulseModeId?: string,
): MetronomeSubdivision {
  const nextMode = getPulseModeById(nextMeter, nextPulseModeId)
  if (!isSubdivisionAvailable(nextMeter, currentSubdivision, nextMode.availableSubdivisions)) {
    return nextMode.defaultSubdivision
  }

  const prevMode = getPulseModeById(previousMeter, prevPulseModeId)
  if (prevMode.pulseUnit !== nextMode.pulseUnit || prevMode.compound !== nextMode.compound) {
    return nextMode.defaultSubdivision
  }

  return currentSubdivision
}

export function accentLevelsToLegacyPattern(levels: MetronomeAccentLevel[]): boolean[] {
  return levels.map((level) => level === 'strong' || level === 'medium')
}

export function legacyPatternToAccentLevels(
  meter: MetronomeMeter,
  pattern: boolean[],
  feelId?: string,
  pulseModeId?: string,
  pulseCount?: number,
): MetronomeAccentLevel[] {
  const count = pulseCount ?? getTimeSignatureDefinition(meter).pulseCount
  const defaultLevels =
    pattern.length === count
      ? pattern.map((accented, index) => {
          if (!accented) return 'weak'
          return index === 0 ? 'strong' : 'medium'
        })
      : getAccentLevelsFromDefaults(meter, feelId, pulseModeId)

  return Array.from({ length: count }, (_, index) => defaultLevels[index] ?? 'weak')
}

export function getAccentLevelsFromDefaults(
  meter: MetronomeMeter,
  feelId?: string,
  pulseModeId?: string,
): MetronomeAccentLevel[] {
  return getAccentLevelsForMeter(meter, feelId, pulseModeId)
}

export function cycleAccentLevel(current: MetronomeAccentLevel): MetronomeAccentLevel {
  if (current === 'weak') return 'medium'
  if (current === 'medium') return 'strong'
  if (current === 'strong') return 'silent'
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
