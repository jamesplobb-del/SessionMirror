/** Primary reference track — boxes 2–6 overdub to this panel only (MVP). */
export const TRACK1_PANEL_ID = 'a'

/** Track 1: mic from Record tap; 4-beat count-in in file; performance on session beat 5. */
export const TRACK1_COUNT_IN_BEATS = 4
export const TRACK1_MIC_START_BEAT = 1
export const TRACK1_PERFORMANCE_START_BEAT = 5
/** Beats from file start (mic on beat 1) to musical performance entry. */
export const TRACK1_PERFORMANCE_OFFSET_BEATS = 4

/** Overdub: 8-beat count-in; mic + reference on session beat 5; performance on beat 9. */
export const OVERDUB_COUNT_IN_BEATS = 8
export const OVERDUB_MIC_START_BEAT = 5
export const OVERDUB_REFERENCE_START_BEAT = 5
export const OVERDUB_PERFORMANCE_START_BEAT = 9
/** Beats from overdub file start (mic on session beat 5) to performance on beat 9. */
export const OVERDUB_PERFORMANCE_OFFSET_BEATS = 4

export interface MultitrackRecordingBeatSchedule {
  countInBeats: number
  micStartBeat: number
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

/** Schedule mic start one beat early so capture aligns with the target beat after RTL. */
export function micStartLeadMs(bpm: number, rtlMs: number): number {
  const beatMs = beatsToMs(1, bpm)
  return Math.max(0, beatMs - Math.max(0, rtlMs))
}

export function isOverdubPanel(panelId: string): boolean {
  return panelId !== TRACK1_PANEL_ID
}

export function getRecordingBeatSchedule(panelId: string): MultitrackRecordingBeatSchedule {
  if (!isOverdubPanel(panelId)) {
    return {
      countInBeats: TRACK1_COUNT_IN_BEATS,
      micStartBeat: TRACK1_MIC_START_BEAT,
      performanceStartBeat: TRACK1_PERFORMANCE_START_BEAT,
      performanceStartOffsetBeats: TRACK1_PERFORMANCE_OFFSET_BEATS,
      referenceStartBeat: null,
      referenceTrackId: null,
      isOverdub: false,
    }
  }
  return {
    countInBeats: OVERDUB_COUNT_IN_BEATS,
    micStartBeat: OVERDUB_MIC_START_BEAT,
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
  rtlMs = 0,
): MultitrackTakeTimingMetadata {
  const schedule = getRecordingBeatSchedule(panelId)
  const beatOffsetMs = beatsToMs(schedule.performanceStartOffsetBeats, bpm)
  return {
    recordingBpm: bpm,
    performanceStartBeat: schedule.performanceStartBeat,
    performanceStartOffsetBeats: schedule.performanceStartOffsetBeats,
    referenceStartBeat: schedule.referenceStartBeat,
    referenceTrackId: schedule.isOverdub ? (referenceTakeId ?? null) : null,
    timelineOffsetMs: Math.max(0, beatOffsetMs - Math.round(rtlMs)),
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
