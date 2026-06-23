import { useEffect, type RefObject } from 'react'
import { attachMediaAudioSessionRouting } from '../utils/audioSessionRoute'

/**
 * Wire iOS stereo routing to a media element's play / pause / ended events.
 * Restores the recording route on unmount if this element was playing.
 */
export function useMediaAudioSessionRouting(
  mediaRef: RefObject<HTMLMediaElement | null>,
  enabled = true,
  dependencyKey?: string | null,
): void {
  useEffect(() => {
    if (!enabled) return

    const media = mediaRef.current
    if (!media) return

    return attachMediaAudioSessionRouting(media)
  }, [enabled, mediaRef, dependencyKey])
}
