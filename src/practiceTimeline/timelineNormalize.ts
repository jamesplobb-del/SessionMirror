import {
  defaultPatternRepeat,
  patternCycleBars,
  patternStepBars,
} from './patternLogic'
import type {
  MeterPatternStep,
  PatternRepeatMode,
  PracticeTimeline,
  TimelineSection,
} from './types'

type LegacySection = TimelineSection & { repeat?: 'none' | '2x' | '3x' | '4x' }

const LEGACY_REPEAT: Record<string, number> = {
  none: 1,
  '2x': 2,
  '3x': 3,
  '4x': 4,
}

function sanitizePatternStep(step: MeterPatternStep): MeterPatternStep {
  return {
    ...step,
    id: step.id || `pattern-step-${step.meter}`,
    bpm: Math.max(40, Math.min(300, Math.round(step.bpm))),
    bars: patternStepBars(step),
    subdivision: step.subdivision ?? 'auto',
  }
}

function sanitizePatternRepeat(
  repeat: PatternRepeatMode | undefined,
  steps: MeterPatternStep[],
): PatternRepeatMode | undefined {
  if (!repeat) return defaultPatternRepeat(steps)
  if (repeat.kind === 'totalMeasures') {
    const cycle = patternCycleBars(steps)
    return {
      kind: 'totalMeasures',
      measures: Math.max(cycle, Math.min(512, Math.round(repeat.measures))),
    }
  }
  return {
    kind: 'cycles',
    cycles: Math.max(1, Math.min(99, Math.round(repeat.cycles))),
  }
}

export function normalizeSection(section: LegacySection): TimelineSection {
  const { repeat: legacyRepeat, ...rest } = section
  let repeatCount = rest.repeatCount ?? 1
  if (legacyRepeat && LEGACY_REPEAT[legacyRepeat]) {
    repeatCount = LEGACY_REPEAT[legacyRepeat]
  }
  repeatCount = Math.max(1, Math.min(99, Math.round(repeatCount)))

  const patternSteps = rest.patternSteps?.length
    ? rest.patternSteps.map(sanitizePatternStep)
    : undefined

  return {
    ...rest,
    repeatCount,
    patternSteps,
    patternRepeat: patternSteps?.length
      ? sanitizePatternRepeat(rest.patternRepeat, patternSteps)
      : undefined,
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
