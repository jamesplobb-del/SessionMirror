import { clampBpm } from '../utils/metronomeConfig'
import { effectiveBars } from './timeSignatureLogic'
import {
  defaultPatternRepeat,
  patternCycleBars,
  patternStepBars,
} from './patternLogic'
import { normalizePatternSectionTempo } from './patternTempo'
import type {
  MeterPatternStep,
  PatternRepeatMode,
  PracticeTimeline,
  SectionAdvanced,
  SectionTempoMarker,
  TempoRampShape,
  TimelineSection,
} from './types'

const VALID_RAMP_SHAPES: TempoRampShape[] = [
  'linear',
  'stepped',
  'ease-in',
  'ease-out',
  'ease-in-out',
]

function sanitizeTempoRamp(ramp: SectionAdvanced['tempoRamp']): SectionAdvanced['tempoRamp'] {
  if (!ramp) return undefined
  const shape = ramp.shape && VALID_RAMP_SHAPES.includes(ramp.shape) ? ramp.shape : undefined
  return {
    enabled: Boolean(ramp.enabled),
    endBpm: clampBpm(ramp.endBpm ?? 120),
    ...(shape ? { shape } : {}),
  }
}

function sanitizeTempoMarkers(
  markers: SectionTempoMarker[] | undefined,
  maxMeasure: number,
): SectionTempoMarker[] | undefined {
  if (!markers?.length) return undefined
  const seen = new Set<string>()
  const cleaned = markers
    .map((marker) => ({
      id: marker.id || `tempo-marker-${marker.measure}`,
      measure: Math.max(1, Math.min(maxMeasure, Math.round(marker.measure))),
      beat: marker.beat ? Math.max(1, Math.min(16, Math.round(marker.beat))) : undefined,
      bpm: clampBpm(marker.bpm),
    }))
    .filter((marker) => {
      const key = `${marker.measure}:${marker.beat ?? 0}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.measure - b.measure || (a.beat ?? 1) - (b.beat ?? 1))
  return cleaned.length ? cleaned : undefined
}

function sanitizeAdvanced(
  advanced: SectionAdvanced | undefined,
  maxMeasure: number,
): SectionAdvanced | undefined {
  if (!advanced) return undefined
  const tempoRamp = sanitizeTempoRamp(advanced.tempoRamp)
  const tempoMarkers = sanitizeTempoMarkers(advanced.tempoMarkers, maxMeasure)
  const next: SectionAdvanced = { ...advanced }
  if (tempoRamp) next.tempoRamp = tempoRamp
  else delete next.tempoRamp
  if (tempoMarkers) next.tempoMarkers = tempoMarkers
  else delete next.tempoMarkers
  return Object.keys(next).length ? next : undefined
}

type LegacySection = TimelineSection & { repeat?: 'none' | '2x' | '3x' | '4x' }

const LEGACY_REPEAT: Record<string, number> = {
  none: 1,
  '2x': 2,
  '3x': 3,
  '4x': 4,
}

function sanitizePatternStep(step: MeterPatternStep): MeterPatternStep {
  const { bpm: _legacyBpm, ...rest } = step
  return {
    ...rest,
    id: rest.id || `pattern-step-${rest.meter}`,
    bars: patternStepBars(rest),
    subdivision: rest.subdivision ?? 'auto',
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

  const normalized: TimelineSection = {
    ...rest,
    repeatCount,
    patternSteps,
    patternRepeat: patternSteps?.length
      ? sanitizePatternRepeat(rest.patternRepeat, patternSteps)
      : undefined,
    advanced: sanitizeAdvanced(rest.advanced, Math.max(1, rest.bars * repeatCount)),
  }

  const withPattern = patternSteps?.length ? normalizePatternSectionTempo(normalized) : normalized
  const maxMeasure = Math.max(1, effectiveBars(withPattern))
  return {
    ...withPattern,
    advanced: sanitizeAdvanced(withPattern.advanced, maxMeasure),
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
