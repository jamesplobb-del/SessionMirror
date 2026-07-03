import { effectiveBars, resolveSectionTiming, tempoRampLabel } from './timeSignatureLogic'
import type { PracticeTimeline, TimelineSection } from './types'

export function describeSection(section: TimelineSection): string {
  const bars = effectiveBars(section)
  const barWord = bars === 1 ? 'bar' : 'bars'
  const timing = resolveSectionTiming(section)
  const feel = timing.feelOptions.find((option) => option.id === timing.feelId)
  const ramp = tempoRampLabel(section)
  const repeat =
    section.repeatCount > 1 ? ` · ${section.repeatCount}×` : ''

  if (feel && ramp) {
    return `${section.meter} · ${feel.label} · ${bars} ${barWord} · ${section.bpm} BPM · ${ramp}${repeat}`
  }
  if (feel) {
    return `${section.meter} · ${feel.label} · ${bars} ${barWord} · ${section.bpm} BPM${repeat}`
  }
  if (ramp) {
    return `${section.meter} · ${bars} ${barWord} · ${ramp}${repeat}`
  }
  return `${bars} ${barWord} of ${section.meter} at ${section.bpm} BPM${repeat}`
}

export function timelineSummaryLines(timeline: PracticeTimeline): string[] {
  if (timeline.sections.length === 0) {
    return ['Add sections to build your practice', 'Finish']
  }
  return [...timeline.sections.map(describeSection), 'Finish']
}
