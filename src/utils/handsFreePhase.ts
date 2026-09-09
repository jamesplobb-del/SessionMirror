export type HandsFreePhase = 'preparing' | 'listening' | 'recording' | 'playback' | 'saving' | 'countdown'

export interface HandsFreePhaseInput {
  autoSoundRecording: boolean
  isRecording: boolean
  handsFreePlaybackPending: boolean
  handsFreeListeningReady: boolean
  playbackPlaying?: boolean
  replayCountdown?: number | null
  /** Drag-to-delete borrows the record slot — hands-free status must stand down. */
  dragDeleteActive: boolean
  /** Video takes show a "finishing" spinner that owns the same slot. */
  finishingTake: boolean
}

/**
 * Single source of truth for the hands-free phase, shared by the control deck
 * carousel and the full-screen hands-free stage so the two can never disagree
 * about what the app is currently doing.
 */
export function resolveHandsFreePhase({
  autoSoundRecording,
  isRecording,
  handsFreePlaybackPending,
  handsFreeListeningReady,
  dragDeleteActive,
  finishingTake,
  playbackPlaying,
  replayCountdown,
}: HandsFreePhaseInput): HandsFreePhase | null {
  if (!autoSoundRecording || dragDeleteActive) return null
  if (finishingTake) return 'saving'
  if (handsFreePlaybackPending && !isRecording) return playbackPlaying === false ? 'saving' : 'playback'
  if (isRecording && replayCountdown != null) return 'countdown'
  if (isRecording) return 'recording'
  return handsFreeListeningReady ? 'listening' : 'preparing'
}
