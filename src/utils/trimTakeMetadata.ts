import type { Take, TakeUpdate } from '../types'

/** Rebase analysis and playback alignment to the new media's time origin. */
export function trimmedTakeMetadata(take: Take, start: number, duration: number): TakeUpdate {
  return {
    duration,
    pitchSeries: (take.pitchSeries ?? [])
      .filter(sample => sample.time >= start && sample.time <= start + duration)
      .map(sample => ({ ...sample, time: sample.time - start })),
    timelineOffsetMs: Math.max(0, (take.timelineOffsetMs ?? 0) - start * 1000),
    ...(take.performanceStartSeconds !== undefined
      ? { performanceStartSeconds: Math.max(0, take.performanceStartSeconds - start) }
      : {}),
    ...(take.mediaType !== 'audio' ? { thumbnailUrl: '' } : {}),
  }
}
