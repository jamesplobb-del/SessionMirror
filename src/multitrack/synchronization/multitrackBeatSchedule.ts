/** Primary reference track — boxes 2–6 overdub to this panel only (MVP). */
export const TRACK1_PANEL_ID = 'a'

/** Track 1: 4-beat count-in; performance enters on beat 5. */
export const TRACK1_COUNT_IN_BEATS = 4
export const TRACK1_PERFORMANCE_START_BEAT = 5
export const TRACK1_PERFORMANCE_OFFSET_BEATS = 4

/** Overdub boxes 2–6: 8-beat count-in; reference on beat 5; performance on beat 9. */
export const OVERDUB_COUNT_IN_BEATS = 8
export const OVERDUB_REFERENCE_START_BEAT = 5
export const OVERDUB_PERFORMANCE_START_BEAT = 9
export const OVERDUB_PERFORMANCE_OFFSET_BEATS = 8

export interface MultitrackRecordingBeatSchedule {
  countInBeats: number
  performanceStartBeat: number
  performanceStartOffsetBeats: number
  referenceStartBeat: number | null
  referenceTrackId: string | null
  isOverdub: boolean
}

export interface MultitrackTakeTimingMetadata {
  recordingBpm: number
  performanceStartBeat: number
  performanceStartOffsetBeats: number
  referenceStartBeat: number | null
  referenceTrackId: string | null
  timelineOffsetMs: number
}

export function beatDurationSec(bpm: number): number {
  return 60 / Math.max(40, Math.min(300, Math.round(bpm)))
}

export function beatsToMs(beats: number, bpm: number): number {
  return Math.round(beats * beatDurationSec(bpm) * 1000)
}

export function isOverdubPanel(panelId: string): boolean {
  return panelId !== TRACK1_PANEL_ID
}

export function getRecordingBeatSchedule(panelId: string): MultitrackRecordingBeatSchedule {
  if (!isOverdubPanel(panelId)) {
    return {
      countInBeats: TRACK1_COUNT_IN_BEATS,
      performanceStartBeat: TRACK1_PERFORMANCE_START_BEAT,
      performanceStartOffsetBeats: TRACK1_PERFORMANCE_OFFSET_BEATS,
      referenceStartBeat: null,
      referenceTrackId: null,
      isOverdub: false,
    }
  }
  return {
    countInBeats: OVERDUB_COUNT_IN_BEATS,
    performanceStartBeat: OVERDUB_PERFORMANCE_START_BEAT,
    performanceStartOffsetBeats: OVERDUB_PERFORMANCE_OFFSET_BEATS,
    referenceStartBeat: OVERDUB_REFERENCE_START_BEAT,
    referenceTrackId: TRACK1_PANEL_ID,
    isOverdub: true,
  }
}

export function buildTakeTimingMetadata(
  panelId: string,
  bpm: number,
  referenceTakeId?: string | null,
): MultitrackTakeTimingMetadata {
  const schedule = getRecordingBeatSchedule(panelId)
  return {
    recordingBpm: bpm,
    performanceStartBeat: schedule.performanceStartBeat,
    performanceStartOffsetBeats: schedule.performanceStartOffsetBeats,
    referenceStartBeat: schedule.referenceStartBeat,
    referenceTrackId: schedule.isOverdub ? (referenceTakeId ?? null) : null,
    timelineOffsetMs: beatsToMs(schedule.performanceStartOffsetBeats, bpm),
  }
}

export function timelineOffsetMsForTake(
  take: {
    performanceStartOffsetBeats?: number
    recordingBpm?: number
    timelineOffsetMs?: number
  },
  sessionBpm: number,
): number {
  if (take.performanceStartOffsetBeats != null) {
    const bpm = take.recordingBpm ?? sessionBpm
    return beatsToMs(take.performanceStartOffsetBeats, bpm)
  }
  return take.timelineOffsetMs ?? 0
}
