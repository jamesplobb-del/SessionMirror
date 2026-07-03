import type { MetronomeSubdivision } from './metronomeTypes'
import {
  accentsForPulseMode,
  feelOptionsForPulseMode,
  getDefaultPulseMode,
  getPulseModeById,
  type PulseModeDefinition,
} from './pulseModes'
import type { MetronomeAccentLevel, MetronomeMeter, PulseUnit } from './timeSignatureDefinitions'

export interface ResolvedPulseTiming {
  meter: MetronomeMeter
  pulseModeId: string
  numerator: number
  denominator: number
  pulseCount: number
  pulseUnit: PulseUnit
  pulseName: string
  bpmSymbol: string
  compound: boolean
  feelId?: string
  feelOptions: { id: string; label: string }[]
  accentLevels: MetronomeAccentLevel[]
  defaultSubdivision: MetronomeSubdivision
  availableSubdivisions: MetronomeSubdivision[]
}

export interface ResolvePulseTimingInput {
  meter: MetronomeMeter
  pulseModeId?: string
  feelId?: string
  beatGrouping?: number[]
  customAccents?: MetronomeAccentLevel[]
}

function parseMeterFraction(meter: MetronomeMeter): { numerator: number; denominator: number } {
  const [numerator, denominator] = meter.split('/').map(Number)
  return { numerator, denominator }
}

export function resolvePulseTiming(input: ResolvePulseTimingInput): ResolvedPulseTiming {
  const mode = getPulseModeById(input.meter, input.pulseModeId)
  const { numerator, denominator } = parseMeterFraction(input.meter)

  let accentLevels: MetronomeAccentLevel[]
  if (input.customAccents?.length) {
    accentLevels = [...input.customAccents]
  } else {
    accentLevels = accentsForPulseMode(mode, input.feelId, input.beatGrouping)
  }

  const feelId =
    input.beatGrouping?.length
      ? undefined
      : input.feelId ?? mode.defaultFeelId

  while (accentLevels.length < mode.pulseCount) {
    accentLevels.push('weak')
  }
  accentLevels = accentLevels.slice(0, mode.pulseCount)

  return {
    meter: input.meter,
    pulseModeId: mode.id,
    numerator,
    denominator,
    pulseCount: mode.pulseCount,
    pulseUnit: mode.pulseUnit,
    pulseName: mode.pulseName,
    bpmSymbol: mode.bpmSymbol,
    compound: mode.compound,
    feelId,
    feelOptions: feelOptionsForPulseMode(mode),
    accentLevels,
    defaultSubdivision: mode.defaultSubdivision,
    availableSubdivisions: mode.availableSubdivisions,
  }
}

export function resolvePulseTimingFromMode(
  meter: MetronomeMeter,
  mode: PulseModeDefinition,
  options?: {
    feelId?: string
    beatGrouping?: number[]
    customAccents?: MetronomeAccentLevel[]
  },
): ResolvedPulseTiming {
  return resolvePulseTiming({
    meter,
    pulseModeId: mode.id,
    feelId: options?.feelId,
    beatGrouping: options?.beatGrouping,
    customAccents: options?.customAccents,
  })
}

export function defaultResolvedPulseTiming(meter: MetronomeMeter): ResolvedPulseTiming {
  const mode = getDefaultPulseMode(meter)
  return resolvePulseTimingFromMode(meter, mode)
}

export function formatBpmLabel(bpm: number, resolved: ResolvedPulseTiming): string {
  return `${resolved.bpmSymbol} = ${bpm}`
}

export function validateGroupingForResolved(
  grouping: number[],
  resolved: ResolvedPulseTiming,
): boolean {
  const sum = grouping.reduce((total, value) => total + value, 0)
  return sum === resolved.pulseCount
}

export function groupingValidationMessageForResolved(resolved: ResolvedPulseTiming): string {
  return `Groups must add up to ${resolved.pulseCount} (e.g. 2+2+3 for 7 eighths)`
}
