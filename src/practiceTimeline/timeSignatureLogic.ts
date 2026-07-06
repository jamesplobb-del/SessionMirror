import {
  formatBpmLabel,
  groupingValidationMessageForResolved,
  resolvePulseTiming,
  validateGroupingForResolved,
  type ResolvedPulseTiming,
} from '../metronome/pulseResolution'
import {
  getMeterDefaults,
  getSubdivisionLabel,
  hasFeelOptions,
  suggestSubdivisionForMeterChange,
  type MetronomeAccentLevel,
  type MetronomeMeter,
  type MetronomeSubdivision,
} from '../utils/metronomeConfig'
import { getPulseModesForMeter } from '../metronome/pulseModes'
import { tempoMarkersSummary, tempoRampShapeLabel } from './tempoDepth'
import { formatGrouping } from './groupingUtils'
import {
  effectivePatternBars,
  formatPatternMetersLabel,
  patternRepeatSummary,
  patternSectionSummary,
  resolveSectionTimingAtMeasure,
  sectionHasMeterPattern,
} from './patternLogic'
import { repeatMultiplier } from './sectionDefaults'
import type { TimelineSection } from './types'

export type { ResolvedPulseTiming }

export interface ResolvedSectionTiming extends ResolvedPulseTiming {
  subdivision: MetronomeSubdivision
}

export function resolveSectionPulse(section: TimelineSection): ResolvedPulseTiming {
  return resolvePulseTiming({
    meter: section.meter,
    pulseModeId: section.pulseModeId,
    feelId: section.feelId,
    beatGrouping: section.advanced?.beatGrouping,
    customAccents: section.advanced?.customAccents,
  })
}

export function resolveSectionTiming(
  section: TimelineSection,
  previousSection?: TimelineSection,
): ResolvedSectionTiming {
  const pulse = resolveSectionPulse(section)
  let subdivision: MetronomeSubdivision
  if (section.subdivision !== 'auto') {
    subdivision = section.subdivision
  } else if (previousSection) {
    const prev = resolveSectionTiming(previousSection)
    subdivision = suggestSubdivisionForMeterChange(
      section.meter,
      previousSection.meter,
      prev.subdivision,
      pulse.pulseModeId,
      prev.pulseModeId,
    )
  } else {
    subdivision = pulse.defaultSubdivision
  }
  return { ...pulse, subdivision }
}

export function tempoRampLabel(section: TimelineSection): string | null {
  const ramp = section.advanced?.tempoRamp
  const markers = tempoMarkersSummary(section)
  if (!ramp?.enabled && !markers) return null

  const parts: string[] = []
  if (ramp?.enabled) {
    const shape = ramp.shape && ramp.shape !== 'linear' ? ` (${tempoRampShapeLabel(ramp.shape)})` : ''
    if (ramp.endBpm > section.bpm) parts.push(`Accel ${section.bpm}→${ramp.endBpm}${shape}`)
    else if (ramp.endBpm < section.bpm) parts.push(`Rit. ${section.bpm}→${ramp.endBpm}${shape}`)
    else parts.push(`Ramp${shape}`)
  }
  if (markers) parts.push(markers)
  return parts.join(' · ')
}

export function sectionTimingSummary(section: TimelineSection, measure = 1): string {
  if (sectionHasMeterPattern(section)) {
    if (measure > 1) {
      const timing = resolveSectionTimingAtMeasure(section, measure)
      const bpmLabel = formatBpmLabel(timing.stepBpm, timing)
      const pattern = formatPatternMetersLabel(section.patternSteps!)
      const repeat = patternRepeatSummary(section)
      return `${timing.meter} · ${pattern} · ${repeat} · ${bpmLabel}`
    }
    return patternSectionSummary(section)
  }

  const timing = resolveSectionTiming(section)
  const feel = timing.feelOptions.find((option) => option.id === timing.feelId)
  const customGroup =
    section.advanced?.beatGrouping?.length && !feel
      ? formatGrouping(section.advanced.beatGrouping)
      : null
  const rhythm =
    timing.subdivision === 'off'
      ? timing.pulseName
      : getSubdivisionLabel(section.meter, timing.subdivision)
  const ramp = tempoRampLabel(section)
  const bpmLabel = formatBpmLabel(section.bpm, timing)
  const parts: string[] = [section.meter, bpmLabel]
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
  const defaults = getMeterDefaults(nextMeter)
  return {
    ...section,
    meter: nextMeter,
    pulseModeId: defaults.pulseModeId,
    feelId: defaults.feelId,
    subdivision: 'auto',
    advanced: {
      ...section.advanced,
      beatGrouping: undefined,
      customAccents: undefined,
    },
  }
}

export function subdivisionLabel(section: TimelineSection): string {
  if (section.subdivision === 'auto') return 'Auto'
  const resolved = resolveSectionTiming(section)
  if (resolved.subdivision === 'off') return resolved.pulseName
  return getSubdivisionLabel(section.meter, resolved.subdivision)
}

export function subdivisionOptionsForSection(section: TimelineSection): MetronomeSubdivision[] {
  return resolveSectionPulse(section).availableSubdivisions
}

export function pulseModeOptionsForSection(section: TimelineSection) {
  return getPulseModesForMeter(section.meter).map((mode) => ({
    id: mode.id,
    label: mode.label,
    bpmSymbol: mode.bpmSymbol,
  }))
}

export function sectionNeedsPulseModeChoice(section: TimelineSection): boolean {
  return getPulseModesForMeter(section.meter).length > 1
}

export function sectionNeedsFeelPrompt(section: TimelineSection): boolean {
  const resolved = resolveSectionPulse(section)
  return hasFeelOptions(section.meter, resolved.pulseModeId)
}

export function effectiveBars(section: TimelineSection): number {
  if (sectionHasMeterPattern(section)) {
    return effectivePatternBars(section)
  }
  return section.bars * repeatMultiplier(section.repeatCount)
}

export function sectionBarWidth(section: TimelineSection, maxBars: number): number {
  const bars = effectiveBars(section)
  if (maxBars <= 0) return 0.25
  return Math.max(0.15, Math.min(1, bars / maxBars))
}

export function defaultFeelForMeter(meter: MetronomeMeter, pulseModeId?: string): string | undefined {
  return getMeterDefaults(meter, pulseModeId).feelId
}

export function validateSectionGrouping(section: TimelineSection, grouping: number[]): boolean {
  const resolved = resolveSectionPulse(section)
  return validateGroupingForResolved(grouping, resolved)
}

export function sectionGroupingValidationMessage(section: TimelineSection): string {
  const resolved = resolveSectionPulse(section)
  return groupingValidationMessageForResolved(resolved)
}

export { formatBpmLabel }
