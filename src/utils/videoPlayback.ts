import { releaseTakePlaybackSpeakerRoute } from './takePlaybackSpeaker'

/** Stop playback and reset position. Never mute — routed elements must stay unmuted for iOS Web Audio. */
export function resetVideoPlayback(media: HTMLMediaElement | null | undefined): void {
  if (!media) return
  media.pause()
  media.currentTime = 0
}

/** Safe unmount / teardown — pause only; never mutate src (React owns the attribute). */
export function pauseVideoElement(media: HTMLMediaElement | null | undefined): void {
  media?.pause()
}

/** Pause every video/audio under a container without touching src. */
export function pauseVideosInContainer(container: HTMLElement | null | undefined): void {
  container?.querySelectorAll('video, audio').forEach((element) => {
    pauseVideoElement(element as HTMLMediaElement)
  })
}

/** Fully silence every video/audio under a container (vault pin / drawer close). */
export function resetVideosInContainer(container: HTMLElement | null | undefined): void {
  container?.querySelectorAll('video, audio').forEach((element) => {
    resetVideoPlayback(element as HTMLMediaElement)
  })
}

/** Release vault decoders on iOS so the live camera can resume. */
export function teardownVideosInContainer(container: HTMLElement | null | undefined): void {
  container?.querySelectorAll('video, audio').forEach((element) => {
    const media = element as HTMLMediaElement
    media.pause()
    releaseTakePlaybackSpeakerRoute(media)
    media.removeAttribute('src')
    if ('srcObject' in media) {
      media.srcObject = null
    }
    media.load()
  })
}
