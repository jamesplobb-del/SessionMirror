import type { BackingTrackMode } from './types'
import { setYoutubeProxyVolume } from './youtubeBridge'

/** Crossfade recorded take vs backing track (mixRatio 0 = all backing, 100 = all take). */
export function applyPlayalongMix(
  mixRatio: number,
  recordedVideo: HTMLVideoElement | null | undefined,
  backingAudio: HTMLAudioElement | null | undefined,
  youtubeIframe: HTMLIFrameElement | null | undefined,
  backingTrackMode: BackingTrackMode,
): void {
  const takeVolume = Math.min(1, Math.max(0, mixRatio / 100))
  const backingVolume = Math.min(1, Math.max(0, 1 - takeVolume))

  if (recordedVideo) {
    recordedVideo.volume = takeVolume
  }

  if (backingTrackMode === 'mp3' && backingAudio) {
    backingAudio.volume = backingVolume
  }

  if (backingTrackMode === 'youtube' && youtubeIframe) {
    setYoutubeProxyVolume(youtubeIframe, backingVolume * 100)
  }
}
