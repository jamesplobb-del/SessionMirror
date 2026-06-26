import {
  finalizeTakePlaybackCleanup,
  playTakeMediaFromUserGesture,
} from './takePlaybackAudio'
import { stabilizeViewportAfterMediaInteraction } from './viewportSync'

export interface InlineTakePlaybackCallbacks {
  onPlaying?: () => void
  onPaused?: () => void
  onFailure?: () => void
}

/** Shared PiP / review play-pause — call from onClick inside a user gesture. */
export function toggleInlineTakePlayback(
  media: HTMLMediaElement | null | undefined,
  callbacks: InlineTakePlaybackCallbacks = {},
): boolean {
  if (!media) return false

  const hasSource = Boolean(media.src || media.currentSrc || media.readyState > 0)
  if (!hasSource) return false

  if (media.paused || media.ended) {
    playTakeMediaFromUserGesture(media, {
      onPlaying: callbacks.onPlaying,
      onFailure: callbacks.onFailure,
    })
    return true
  }

  media.pause()
  void finalizeTakePlaybackCleanup()
  stabilizeViewportAfterMediaInteraction()
  callbacks.onPaused?.()
  return true
}
