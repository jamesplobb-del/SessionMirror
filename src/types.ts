export type MediaType = 'video' | 'audio'

export type RecordingMode = 'video' | 'audio'

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
  /** Recorded takes mirror on playback; uploads show true perspective. */
  mirrorPlayback?: boolean
}

export type SortMode = 'newest' | 'highest-rated'

export type TakeUpdate = Partial<Pick<Take, 'name' | 'rating' | 'notes'>>

export type ReviewSlot = 'benchmark' | 'challenger'

export type ReviewContext = 'vault' | 'compare'
