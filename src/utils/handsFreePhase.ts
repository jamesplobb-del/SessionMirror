export type HandsFreePhase = 'preparing' | 'listening' | 'recording' | 'playback'

export interface HandsFreePhaseInput {
  autoSoundRecording: boolean
  isRecording: boolean
  handsFreePlaybackPending: boolean
  handsFreeListeningReady: boolean
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
}: HandsFreePhaseInput): HandsFreePhase | null {
  if (!autoSoundRecording || dragDeleteActive || finishingTake) return null
  if (handsFreePlaybackPending && !isRecording) return 'playback'
  if (isRecording) return 'recording'
  return handsFreeListeningReady ? 'listening' : 'preparing'
}
