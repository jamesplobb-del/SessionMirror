function beatDurationSec(bpm: number): number {
  return 60 / Math.max(40, Math.min(300, Math.round(bpm)))
}

function beatsToMs(beats: number, bpm: number): number {
  return Math.round(beats * beatDurationSec(bpm) * 1000)
}

export function timelineOffsetMsForTake(
  take: {
    performanceStartOffsetBeats?: number
    recordingBpm?: number
    timelineOffsetMs?: number
  },
  sessionBpm: number,
): number {
  // A persisted millisecond value is canonical. It may be a native measured
  // capture anchor or a manual alignment; never overwrite it with the older
  // beat-derived estimate after relaunch.
  if (take.timelineOffsetMs != null) {
    return take.timelineOffsetMs
  }
  if (take.performanceStartOffsetBeats != null) {
    const bpm = take.recordingBpm ?? sessionBpm
    return beatsToMs(take.performanceStartOffsetBeats, bpm)
  }
  return 0
}
