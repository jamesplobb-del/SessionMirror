import { effectiveBars } from './timeSignatureLogic'
import type { PracticeTimeline, TimelineSection } from './types'

export function describeSection(section: TimelineSection): string {
  const bars = effectiveBars(section)
  const barWord = bars === 1 ? 'bar' : 'bars'
  return `${bars} ${barWord} of ${section.meter} at ${section.bpm} BPM`
}

export function timelineSummaryLines(timeline: PracticeTimeline): string[] {
  if (timeline.sections.length === 0) {
    return ['Add sections to build your practice', 'Finish']
  }
  return [...timeline.sections.map(describeSection), 'Finish']
}
