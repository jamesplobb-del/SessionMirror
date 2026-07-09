import type { PlaybackGainMetadata } from './utils/recordingDiagnostics'

export type MediaType = 'video' | 'audio'

export type RecordingMode = 'video' | 'audio'

export interface PitchSample {
  /** Seconds from the start of the take */
  time: number
  /** Detected fundamental frequency in Hz */
  frequencyHz: number
}

export interface Take {
  id: string
  name: string
  /** Playback URL — Capacitor file src on device, blob URL in web dev */
  videoUrl: string
  /** Relative path under Directory.Data on native; empty on web */
  filePath: string
  videoMimeType: string
  thumbnailUrl: string
  timestamp: number
  rating: number
  notes: string
  /** Defaults to video for legacy takes. */
  mediaType?: MediaType
  /** Opt-in: mirror playback display. Native recordings are saved unmirrored and play back true-perspective by default. */
  mirrorPlayback?: boolean
  /** Device orientation when the take was recorded. */
  recordingOrientation?: 'portrait' | 'landscape'
  /** Audio Enhancer baked into the file after recording — playback skips the live chain. */
  enhancerBaked?: boolean
  /** Optional pitch contour from offline or live analysis */
  pitchSeries?: PitchSample[]
  /** Non-destructive loudness metadata — does not alter the saved file. */
  playbackGainMetadata?: PlaybackGainMetadata
  /** Playback alignment offset in milliseconds. positive = delayed, negative = early */
  timelineOffsetMs?: number
  /** BPM used when this take was recorded — enables beat-based alignment. */
  recordingBpm?: number
  /** Number of count-in beats before the performance starts in this file. */
  performanceStartBeats?: number
  /** Beats from file start to the musical performance entry (alignment). */
  performanceStartOffsetBeats?: number
  /** Seconds from file start to the hands-free performance trigger. */
  performanceStartSeconds?: number
  /** Overdub takes: id of the reference take (Track 1). */
  referenceTrackId?: string
  /** Overdub takes: count-in beat when the reference started. */
  referenceStartBeat?: number
}

export type SortMode = 'newest' | 'highest-rated'

export type TakeUpdate = Partial<Pick<Take, 'name' | 'rating' | 'notes'>>

export type ReviewSlot = 'benchmark' | 'challenger'

export type ReviewContext = 'vault' | 'compare'
