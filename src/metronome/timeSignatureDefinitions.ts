import type { MetronomeSubdivision } from './metronomeTypes'
import {
  accentsForPulseMode,
  getDefaultPulseMode,
  getPulseModeById,
  METER_PULSE_MODES,
} from './pulseModes'

export type MetronomeMeter =
  | '2/4'
  | '3/4'
  | '4/4'
  | '5/4'
  | '6/4'
  | '7/4'
  | '2/2'
  | '3/2'
  | '4/2'
  | '5/2'
  | '6/2'
  | '7/2'
  | '3/8'
  | '4/8'
  | '6/8'
  | '9/8'
  | '12/8'
  | '13/8'
  | '15/8'
  | '16/8'
  | '5/8'
  | '7/8'
  | '8/8'
  | '10/8'
  | '11/8'
  | '3/16'
  | '5/16'
  | '7/16'
  | '9/16'
  | '11/16'
  | '13/16'
  | '15/16'
  | '16/16'

export type PulseUnit =
  | 'half'
  | 'dotted-half'
  | 'quarter'
  | 'dotted-quarter'
  | 'eighth'
  | 'sixteenth'

export type MetronomeAccentLevel = 'strong' | 'medium' | 'weak' | 'silent'

export interface BeatFeelOption {
  id: string
  label: string
  grouping: number[]
}

export interface TimeSignatureDefinition {
  label: MetronomeMeter
  numerator: number
  denominator: number
  /** Conducting pulses per bar — BPM always refers to this pulse. */
  pulseCount: number
  pulseUnit: PulseUnit
  pulseName: string
  compound: boolean
  defaultSubdivision: MetronomeSubdivision
  availableSubdivisions: MetronomeSubdivision[]
  feelOptions?: BeatFeelOption[]
  defaultFeelId?: string
  defaultAccentLevels: MetronomeAccentLevel[]
}

function buildDefinition(meter: MetronomeMeter): TimeSignatureDefinition {
  const mode = getDefaultPulseMode(meter)
  const [numerator, denominator] = meter.split('/').map(Number)
  return {
    label: meter,
    numerator,
    denominator,
    pulseCount: mode.pulseCount,
    pulseUnit: mode.pulseUnit,
    pulseName: mode.pulseName,
    compound: mode.compound,
    defaultSubdivision: mode.defaultSubdivision,
    availableSubdivisions: mode.availableSubdivisions,
    feelOptions: mode.feelOptions,
    defaultFeelId: mode.defaultFeelId,
    defaultAccentLevels: mode.defaultAccentLevels,
  }
}

export const TIME_SIGNATURE_DEFINITIONS = Object.fromEntries(
  (Object.keys(METER_PULSE_MODES) as MetronomeMeter[]).map((meter) => [meter, buildDefinition(meter)]),
) as Record<MetronomeMeter, TimeSignatureDefinition>

export function getTimeSignatureDefinition(meter: MetronomeMeter): TimeSignatureDefinition {
  return TIME_SIGNATURE_DEFINITIONS[meter]
}

export function getFeelOption(
  meter: MetronomeMeter,
  feelId: string | undefined,
  pulseModeId?: string,
): BeatFeelOption | undefined {
  const mode = getPulseModeById(meter, pulseModeId)
  if (!mode.feelOptions?.length) return undefined
  const resolvedId = feelId ?? mode.defaultFeelId
  return mode.feelOptions.find((option) => option.id === resolvedId) ?? mode.feelOptions[0]
}

export function getDefaultFeelId(meter: MetronomeMeter, pulseModeId?: string): string | undefined {
  return getPulseModeById(meter, pulseModeId).defaultFeelId
}

export function getAccentLevelsForMeter(
  meter: MetronomeMeter,
  feelId?: string,
  pulseModeId?: string,
  beatGrouping?: number[],
): MetronomeAccentLevel[] {
  const mode = getPulseModeById(meter, pulseModeId)
  return accentsForPulseMode(mode, feelId, beatGrouping)
}

export function getBeatGrouping(
  meter: MetronomeMeter,
  feelId?: string,
  pulseModeId?: string,
): number[] {
  const feelOption = getFeelOption(meter, feelId, pulseModeId)
  if (feelOption) return feelOption.grouping
  const mode = getPulseModeById(meter, pulseModeId)
  return Array.from({ length: mode.pulseCount }, () => 1)
}
