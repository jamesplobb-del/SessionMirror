import {
  finalizeInlineTakeBoxPlaybackCleanup,
  playInlineTakeBoxFromUserGesture,
} from './takePlaybackAudio'
import { stabilizeViewportAfterMediaInteraction } from './viewportSync'

export interface InlineTakePlaybackCallbacks {
  onPlaying?: () => void
  onPaused?: () => void
  onFailure?: () => void
}

/**
 * Shared PiP / review play-pause — call from onClick inside a user gesture.
 *
 * Uses the lightweight inline route (speaker hold only, no `playbackRouteActive`)
 * so a live camera preview never has its AVAudioSession ownership contested —
 * contesting it here previously caused decoder stalls/freezes during playback.
 */
export function toggleInlineTakePlayback(
  media: HTMLMediaElement | null | undefined,
  callbacks: InlineTakePlaybackCallbacks = {},
): boolean {
  if (!media) return false

  const hasSource = Boolean(media.src || media.currentSrc || media.readyState > 0)
  if (!hasSource) return false

  if (media.paused || media.ended) {
    playInlineTakeBoxFromUserGesture(media, {
      onPlaying: callbacks.onPlaying,
      onFailure: callbacks.onFailure,
    })
    return true
  }

  media.pause()
  void finalizeInlineTakeBoxPlaybackCleanup()
  stabilizeViewportAfterMediaInteraction()
  callbacks.onPaused?.()
  return true
}
