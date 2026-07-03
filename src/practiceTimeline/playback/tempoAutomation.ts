import { secondsPerPulse } from '../../metronome/metronomeTiming'
import type { TempoRamp } from '../types'

export function bpmAtMeasure(
  startBpm: number,
  measure: number,
  totalMeasures: number,
  ramp?: TempoRamp,
): number {
  if (!ramp?.enabled || totalMeasures <= 1) return startBpm
  const t = Math.max(0, Math.min(1, (measure - 1) / (totalMeasures - 1)))
  return Math.round(startBpm + (ramp.endBpm - startBpm) * t)
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
