import {
  getAccentLevelsForMeter,
  getDefaultFeelId,
  getMeterDefaults,
  getSubdivisionLabel,
  getTimeSignatureDefinition,
  getAvailableSubdivisions,
  hasFeelOptions,
  suggestSubdivisionForMeterChange,
  type MetronomeAccentLevel,
  type MetronomeMeter,
  type MetronomeSubdivision,
} from '../utils/metronomeConfig'
import { formatGrouping } from './groupingUtils'
import { repeatMultiplier } from './sectionDefaults'
import type { TimelineSection } from './types'

export interface ResolvedSectionTiming {
  meter: MetronomeMeter
  feelId?: string
  subdivision: MetronomeSubdivision
  accentLevels: MetronomeAccentLevel[]
  feelOptions: { id: string; label: string }[]
}

export function resolveSubdivision(
  section: TimelineSection,
  previousMeter?: MetronomeMeter,
): MetronomeSubdivision {
  if (section.subdivision !== 'auto') return section.subdivision

  const defaults = getMeterDefaults(section.meter)
  if (previousMeter) {
    return suggestSubdivisionForMeterChange(
      section.meter,
      previousMeter,
      defaults.subdivision,
    )
  }
  return defaults.subdivision
}

export function resolveSectionTiming(section: TimelineSection): ResolvedSectionTiming {
  const def = getTimeSignatureDefinition(section.meter)
  const feelOptions =
    def.feelOptions?.map((option) => ({ id: option.id, label: option.label })) ?? []
  const feelId = section.feelId ?? def.defaultFeelId
  const subdivision = resolveSubdivision(section)
  const meterDefaults = getMeterDefaults(section.meter)

  let accentLevels = getAccentLevelsForMeter(section.meter, feelId)
  if (section.advanced?.customAccents?.length) {
    accentLevels = section.advanced.customAccents
  } else if (section.advanced?.beatGrouping?.length) {
    accentLevels = accentsFromGrouping(section.advanced.beatGrouping)
  } else if (feelId) {
    accentLevels = getAccentLevelsForMeter(section.meter, feelId)
  } else {
    accentLevels = meterDefaults.accentLevels
  }

  return { meter: section.meter, feelId, subdivision, accentLevels, feelOptions }
}

export function tempoRampLabel(section: TimelineSection): string | null {
  const ramp = section.advanced?.tempoRamp
  if (!ramp?.enabled) return null
  if (ramp.endBpm > section.bpm) return `Accel ${section.bpm}→${ramp.endBpm}`
  if (ramp.endBpm < section.bpm) return `Rit. ${section.bpm}→${ramp.endBpm}`
  return null
}

export function sectionTimingSummary(section: TimelineSection): string {
  const timing = resolveSectionTiming(section)
  const def = getTimeSignatureDefinition(section.meter)
  const feel = timing.feelOptions.find((option) => option.id === timing.feelId)
  const customGroup =
    section.advanced?.beatGrouping?.length && !feel
      ? formatGrouping(section.advanced.beatGrouping)
      : null
  const rhythm =
    timing.subdivision === 'off'
      ? def.pulseName
      : getSubdivisionLabel(section.meter, timing.subdivision)
  const ramp = tempoRampLabel(section)
  const parts: string[] = [section.meter]
  if (feel) parts.push(feel.label)
  else if (customGroup) parts.push(customGroup)
  parts.push(rhythm)
  if (ramp) parts.push(ramp)
  return parts.join(' · ')
}

export function accentsFromGrouping(grouping: number[]): MetronomeAccentLevel[] {
  const levels: MetronomeAccentLevel[] = []
  for (let groupIndex = 0; groupIndex < grouping.length; groupIndex += 1) {
    const groupAccent: MetronomeAccentLevel = groupIndex === 0 ? 'strong' : 'medium'
    for (let beat = 0; beat < grouping[groupIndex]; beat += 1) {
      levels.push(beat === 0 ? groupAccent : 'weak')
    }
  }
  return levels
}

export function applyMeterChange(
  section: TimelineSection,
  nextMeter: MetronomeMeter,
): TimelineSection {
  const def = getTimeSignatureDefinition(nextMeter)
  return {
    ...section,
    meter: nextMeter,
    feelId: def.defaultFeelId,
    subdivision: section.subdivision === 'auto' ? 'auto' : section.subdivision,
    advanced: {
      ...section.advanced,
      beatGrouping: undefined,
      customAccents: undefined,
    },
  }
}

export function subdivisionLabel(section: TimelineSection): string {
  if (section.subdivision === 'auto') return 'Auto'
  const resolved = resolveSubdivision(section)
  const def = getTimeSignatureDefinition(section.meter)
  if (resolved === 'off') return def.pulseName
  return getSubdivisionLabel(section.meter, resolved)
}

export function subdivisionOptionsForMeter(meter: MetronomeMeter): MetronomeSubdivision[] {
  return getAvailableSubdivisions(meter)
}

export function effectiveBars(section: TimelineSection): number {
  return section.bars * repeatMultiplier(section.repeatCount)
}

export function sectionBarWidth(section: TimelineSection, maxBars: number): number {
  const bars = effectiveBars(section)
  if (maxBars <= 0) return 0.25
  return Math.max(0.15, Math.min(1, bars / maxBars))
}

export function meterNeedsFeelPrompt(meter: MetronomeMeter): boolean {
  return hasFeelOptions(meter)
}

export function defaultFeelForMeter(meter: MetronomeMeter): string | undefined {
  return getDefaultFeelId(meter)
}
