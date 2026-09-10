import type { PitchReadout } from './pitchUtils'
export interface TunerHistorySample { time: number; pitch: PitchReadout | null }
export const TUNER_HISTORY_MS = 120_000
const MAX_TUNER_HISTORY_SAMPLES = 2600
const HISTORY_PRUNE_INTERVAL_MS = 1000
const lastPrunedAt = new WeakMap<TunerHistorySample[], number>()
/** Session-only, bounded history. Keep silence as a break rather than inventing notes. */
export function appendTunerHistory(samples: TunerHistorySample[], time: number, pitch: PitchReadout | null) {
  const last = samples.at(-1)
  if (last && time - last.time < 50 && Boolean(last.pitch) === Boolean(pitch)) return
  samples.push({ time, pitch: pitch ? { ...pitch } : null })
  const previousPrune = lastPrunedAt.get(samples) ?? -Infinity
  if (samples.length <= MAX_TUNER_HISTORY_SAMPLES && time - previousPrune < HISTORY_PRUNE_INTERVAL_MS) return
  const cutoff = time - TUNER_HISTORY_MS
  let staleCount = 0
  while (staleCount < samples.length && samples[staleCount].time < cutoff) staleCount += 1
  const overflow = Math.max(0, samples.length - MAX_TUNER_HISTORY_SAMPLES)
  const removeCount = Math.max(staleCount, overflow)
  if (removeCount > 0) samples.splice(0, removeCount)
  lastPrunedAt.set(samples, time)
}
export function nearestTunerSample(samples: TunerHistorySample[], time: number) {
  return samples.reduce<TunerHistorySample | undefined>((best, sample) => !best || Math.abs(sample.time-time)<Math.abs(best.time-time) ? sample : best, undefined)
}
