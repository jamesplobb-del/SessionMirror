import type { PracticeTimeline, TimelineSection } from './types'

type LegacySection = TimelineSection & { repeat?: 'none' | '2x' | '3x' | '4x' }

const LEGACY_REPEAT: Record<string, number> = {
  none: 1,
  '2x': 2,
  '3x': 3,
  '4x': 4,
}

export function normalizeSection(section: LegacySection): TimelineSection {
  const { repeat: legacyRepeat, ...rest } = section
  let repeatCount = rest.repeatCount ?? 1
  if (legacyRepeat && LEGACY_REPEAT[legacyRepeat]) {
    repeatCount = LEGACY_REPEAT[legacyRepeat]
  }
  repeatCount = Math.max(1, Math.min(99, Math.round(repeatCount)))

  return {
    ...rest,
    repeatCount,
  }
}

export function normalizeTimeline(timeline: PracticeTimeline): PracticeTimeline {
  return {
    ...timeline,
    sections: timeline.sections.map((section) => normalizeSection(section as LegacySection)),
    settings: {
      countInBars: timeline.settings?.countInBars ?? 0,
      countInWhen: timeline.settings?.countInWhen ?? 'start',
      loopTrack: timeline.settings?.loopTrack ?? false,
    },
  }
}
