export type BackingTrackMode = 'none' | 'youtube' | 'mp3'

export type PlayalongPhase = 'record' | 'review'

export type PlayalongTopTab = 'mp3' | 'youtube'

export interface PlayalongRecordedTake {
  takeId: string
  videoUrl: string
  filePath: string
  durationSeconds: number
}

export interface Mp3VaultTrack {
  id: string
  title: string
  /** WebView-safe playback URL (capacitor:// or blob: or /public path). */
  playbackUrl: string
  /** Relative path under Directory.Data on native; empty on web. */
  filePath: string
  /** Built-in starter pack vs user import. */
  source: 'starter' | 'imported'
}

export interface PlayalongEngineState {
  phase: PlayalongPhase
  backingTrackMode: BackingTrackMode
  backingTrackSource: string
  backingTrackLabel: string
  mixRatio: number
  topTab: PlayalongTopTab
}

export const DEFAULT_PLAYALONG_ENGINE: PlayalongEngineState = {
  phase: 'record',
  backingTrackMode: 'none',
  backingTrackSource: '',
  backingTrackLabel: '',
  mixRatio: 50,
  topTab: 'mp3',
}
