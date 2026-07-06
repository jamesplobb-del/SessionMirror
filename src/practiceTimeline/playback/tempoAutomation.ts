import { secondsPerPulse } from '../../metronome/metronomeTiming'
import {
  interpolateRampBpm,
  resolveMasterBpmAt,
  resolveSectionPlaybackBpm,
  sectionProgressAt,
} from '../tempoDepth'
import { effectiveBars } from '../timeSignatureLogic'
import type { TempoRamp, TimelineSection } from '../types'

export function bpmAtMeasure(
  startBpm: number,
  measure: number,
  totalMeasures: number,
  ramp?: TempoRamp,
): number {
  if (!ramp?.enabled || totalMeasures <= 1) return startBpm
  const shape = ramp.shape ?? 'linear'
  const progress = sectionProgressAt(measure, 1, 1, totalMeasures, shape)
  return interpolateRampBpm(startBpm, ramp.endBpm, progress, shape)
}

export function estimateSectionDurationSeconds(
  bars: number,
  bpm: number,
  pulseCount: number,
  ramp?: TempoRamp,
): number {
  if (bars <= 0 || bpm <= 0) return 0
  if (!ramp?.enabled) return bars * pulseCount * secondsPerPulse(bpm)
  let total = 0
  for (let measure = 1; measure <= bars; measure += 1) {
    total += pulseCount * secondsPerPulse(bpmAtMeasure(bpm, measure, bars, ramp))
  }
  return total
}

/** Duration with per-beat ramps and explicit tempo markers. */
export function estimateSectionDurationWithDepth(
  section: TimelineSection,
  pulseCount: number,
): number {
  const bars = effectiveBars(section)
  if (bars <= 0) return 0
  let total = 0
  for (let measure = 1; measure <= bars; measure += 1) {
    for (let beat = 1; beat <= pulseCount; beat += 1) {
      const bpm = resolveSectionPlaybackBpm(section, measure, beat, pulseCount)
      if (bpm > 0) total += secondsPerPulse(bpm)
    }
  }
  return total
}

export function resolveMasterBpmForSection(
  section: TimelineSection,
  measure: number,
  beat: number,
  pulseCount: number,
): number {
  return resolveMasterBpmAt(section, measure, beat, pulseCount, section.advanced?.tempoRamp)
}
