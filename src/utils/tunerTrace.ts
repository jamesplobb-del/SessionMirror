import { PITCH_SILENCE_FLOOR_CENTS } from './pitchConfig'
import { isSilenceFloorSample } from './pitchUtils'
import { SILK_TRACE_WINDOW_MS, silkTunerGeometry } from './reactiveSilkTuner'

export interface TunerTraceSample { time: number; cents: number }
export interface TunerTrace { samples: TunerTraceSample[]; lastVoicedAt: number; lastPrunedAt: number }
export const createTunerTrace = (): TunerTrace => ({ samples: [], lastVoicedAt: -Infinity, lastPrunedAt: -Infinity })

/** Shape each point once. Older points never change when new readings arrive. */
export function appendTunerTrace(trace: TunerTrace, time: number, measuredCents: number) {
  const previous = trace.samples.at(-1)
  if (previous && time <= previous.time) return
  const elapsed = previous ? time - previous.time : 0
  let cents = measuredCents
  if (isSilenceFloorSample(cents)) {
    // Ignore a brief detector dropout, but leave breaths and rests as gaps.
    if (previous && time - trace.lastVoicedAt <= 65) cents = previous.cents
  } else {
    trace.lastVoicedAt = time
    if (previous && elapsed <= 140 && !isSilenceFloorSample(previous.cents)) {
      const delta = (cents - previous.cents) * (1 - Math.exp(-elapsed / 55))
      const limit = 8 * elapsed / (1000 / 60)
      cents = previous.cents + Math.max(-limit, Math.min(limit, delta))
    }
  }
  // Never draw a straight line across an interruption/background suspension.
  if (previous && elapsed > 140) trace.samples.push({ time: previous.time + 66, cents: PITCH_SILENCE_FLOOR_CENTS })
  trace.samples.push({ time, cents })
  if (time - trace.lastPrunedAt >= 1000 || trace.samples.length > 30000) {
    let remove = 0
    while (remove < trace.samples.length && trace.samples[remove].time < time - 120000) remove++
    trace.samples.splice(0, Math.max(remove, trace.samples.length - 30000))
    trace.lastPrunedAt = time
  }
}

/** A fixed time scale for live and rewind. Panning changes x only, never y. */
export function tunerTracePoints(samples: TunerTraceSample[], endTime: number, width: number, height: number) {
  const geometry = silkTunerGeometry(width, height)
  const span = width - geometry.headroom
  const start = endTime - SILK_TRACE_WINDOW_MS
  let first = samples.findIndex(sample => sample.time >= start)
  if (first < 0) return []
  first = Math.max(0, first - 1)
  const points = []
  for (let i = first; i < samples.length && samples[i].time <= endTime; i++) {
    const sample = samples[i]
    points.push({ time: sample.time, x: (sample.time - start) / SILK_TRACE_WINDOW_MS * span, y: geometry.centsToY(sample.cents), cents: sample.cents })
  }
  return points
}
