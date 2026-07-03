import { patternRepeatSummary, patternSectionSummary, sectionHasMeterPattern } from './patternLogic'
import { tempoMarkersSummary } from './tempoDepth'
import { effectiveBars, formatBpmLabel, resolveSectionTiming, tempoRampLabel } from './timeSignatureLogic'
import type { PracticeTimeline, TimelineSection } from './types'

export function describeSection(section: TimelineSection): string {
  if (sectionHasMeterPattern(section)) {
    const summary = patternSectionSummary(section)
    const bars = effectiveBars(section)
    const repeat = section.repeatCount > 1 ? ` · ${section.repeatCount}×` : ''
    return `${summary} · ${bars} bars${repeat}`
  }

  const timing = resolveSectionTiming(section)
  const bars = section.bars * (section.repeatCount > 1 ? section.repeatCount : 1)
  const barWord = bars === 1 ? 'bar' : 'bars'
  const feel = timing.feelOptions.find((option) => option.id === timing.feelId)
  const repeat = section.repeatCount > 1 ? ` · ${section.repeatCount}×` : ''
  const bpmLabel = formatBpmLabel(section.bpm, timing)

  const rampLabel = tempoRampLabel(section)
  const markerNote = tempoMarkersSummary(section)

  if (feel && rampLabel) {
    return `${section.meter} · ${feel.label} · ${bars} ${barWord} · ${bpmLabel} · ${rampLabel}${repeat}`
  }
  if (feel && markerNote) {
    return `${section.meter} · ${feel.label} · ${bars} ${barWord} · ${bpmLabel} · ${markerNote}${repeat}`
  }
  if (feel) {
    return `${section.meter} · ${feel.label} · ${bars} ${barWord} · ${bpmLabel}${repeat}`
  }
  if (rampLabel) {
    return `${section.meter} · ${bars} ${barWord} · ${rampLabel}${repeat}`
  }
  return `${bars} ${barWord} of ${section.meter} at ${bpmLabel}${repeat}`
}

export function timelineSummaryLines(timeline: PracticeTimeline): string[] {
  if (timeline.sections.length === 0) {
    return ['Add sections to build your practice', 'Finish']
  }
  return [...timeline.sections.map(describeSection), 'Finish']
}

export { patternRepeatSummary }
