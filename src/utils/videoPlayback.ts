/** Stop playback and reset a media element (e.g. when pausing a still-mounted PiP). */
export function resetVideoPlayback(media: HTMLMediaElement | null | undefined): void {
  if (!media) return
  media.pause()
  media.currentTime = 0
  if ('muted' in media) {
    media.muted = true
  }
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
