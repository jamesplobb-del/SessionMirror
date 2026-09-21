import { PITCH_SILENCE_FLOOR_CENTS } from './pitchConfig'
import { isSilenceFloorSample } from './pitchUtils'
import { SILK_TRACE_WINDOW_MS, silkTunerGeometry } from './reactiveSilkTuner'

export interface TunerTraceSample { time: number; cents: number }
export interface TunerTrace { samples: TunerTraceSample[]; lastVoicedAt: number; lastPrunedAt: number }
export const createTunerTrace = (): TunerTrace => ({ samples: [], lastVoicedAt: -Infinity, lastPrunedAt: -Infinity })

// Visual grace only: a quiet attack or a few rejected detector frames should
// not fragment a sustained note. The detector/readout and pitch history retain
// their original data. Never extend this deadline from a held sample.
const DROPOUT_HOLD_MS = 150
const FRAME_INTERRUPTION_MS = 250

/** Shape each point once. Older points never change when new readings arrive. */
export function appendTunerTrace(trace: TunerTrace, time: number, measuredCents: number) {
  const previous = trace.samples.at(-1)
  if (previous && time <= previous.time) return
  const elapsed = previous ? time - previous.time : 0
  let cents = measuredCents
  if (isSilenceFloorSample(cents)) {
    // Ignore a brief detector dropout, but leave breaths and rests as gaps.
    if (previous && time - trace.lastVoicedAt <= DROPOUT_HOLD_MS) cents = previous.cents
  } else {
    trace.lastVoicedAt = time
    if (previous && elapsed <= FRAME_INTERRUPTION_MS && !isSilenceFloorSample(previous.cents)) {
      const delta = (cents - previous.cents) * (1 - Math.exp(-elapsed / 55))
      const limit = 8 * elapsed / (1000 / 60)
      cents = previous.cents + Math.max(-limit, Math.min(limit, delta))
    }
  }
  // Never draw a straight line across an interruption/background suspension.
  if (previous && elapsed > FRAME_INTERRUPTION_MS) trace.samples.push({ time: previous.time + DROPOUT_HOLD_MS + 1, cents: PITCH_SILENCE_FLOOR_CENTS })
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
