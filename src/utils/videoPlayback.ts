/** Stop playback and reset a video element (e.g. when closing an overlay). */
export function resetVideoPlayback(video: HTMLVideoElement | null | undefined): void {
  if (!video) return
  video.pause()
  video.currentTime = 0
  video.muted = true
}

/** Pause and reset every video under a container. */
export function resetVideosInContainer(container: HTMLElement | null | undefined): void {
  container?.querySelectorAll('video').forEach((element) => {
    resetVideoPlayback(element)
  })
}
