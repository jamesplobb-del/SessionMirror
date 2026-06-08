/** Stop playback and reset a video element (e.g. when pausing a still-mounted PiP). */
export function resetVideoPlayback(video: HTMLVideoElement | null | undefined): void {
  if (!video) return
  video.pause()
  video.currentTime = 0
  video.muted = true
}

/** Safe unmount / teardown — pause only; never mutate src (React owns the attribute). */
export function pauseVideoElement(video: HTMLVideoElement | null | undefined): void {
  video?.pause()
}

/** Pause every video under a container without touching src. */
export function pauseVideosInContainer(container: HTMLElement | null | undefined): void {
  container?.querySelectorAll('video').forEach((element) => {
    element.pause()
  })
}

/** Fully silence every video under a container (vault pin / drawer close). */
export function resetVideosInContainer(container: HTMLElement | null | undefined): void {
  container?.querySelectorAll('video').forEach((element) => {
    resetVideoPlayback(element)
  })
}
