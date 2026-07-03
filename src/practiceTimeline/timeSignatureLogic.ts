import {
  getAccentLevelsForMeter,
  getDefaultFeelId,
  getTimeSignatureDefinition,
  hasFeelOptions,
  suggestSubdivisionForMeterChange,
  type MetronomeAccentLevel,
  type MetronomeMeter,
  type MetronomeSubdivision,
} from '../utils/metronomeConfig'
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
  const def = getTimeSignatureDefinition(section.meter)
  if (previousMeter) {
    return suggestSubdivisionForMeterChange(section.meter, previousMeter, def.defaultSubdivision)
  }
  return def.defaultSubdivision
}

export function resolveSectionTiming(section: TimelineSection): ResolvedSectionTiming {
  const def = getTimeSignatureDefinition(section.meter)
  const feelOptions =
    def.feelOptions?.map((option) => ({ id: option.id, label: option.label })) ?? []
  const feelId = section.feelId ?? def.defaultFeelId
  const subdivision = resolveSubdivision(section)

  let accentLevels = getAccentLevelsForMeter(section.meter, feelId)
  if (section.advanced?.customAccents?.length) {
    accentLevels = section.advanced.customAccents
  } else if (section.advanced?.beatGrouping?.length) {
    accentLevels = accentsFromGrouping(section.advanced.beatGrouping)
  }

  return { meter: section.meter, feelId, subdivision, accentLevels, feelOptions }
}

function accentsFromGrouping(grouping: number[]): MetronomeAccentLevel[] {
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
  }
}

export function subdivisionLabel(section: TimelineSection): string {
  if (section.subdivision === 'auto') return 'Auto'
  const resolved = resolveSubdivision(section)
  const def = getTimeSignatureDefinition(section.meter)
  if (resolved === 'off') return def.pulseName
  switch (resolved) {
    case '8ths':
      return '8ths'
    case '16ths':
      return '16ths'
    case 'triplets':
      return 'Triplets'
    default:
      return resolved
  }
}

export function repeatLabel(repeat: TimelineSection['repeat']): string {
  if (repeat === 'none') return 'None'
  return repeat.toUpperCase()
}

export function effectiveBars(section: TimelineSection): number {
  return section.bars * repeatMultiplier(section.repeat)
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
