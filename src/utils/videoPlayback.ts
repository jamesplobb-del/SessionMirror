/** Stop playback and reset a video element (e.g. when pausing an still-mounted PiP). */
export function resetVideoPlayback(video: HTMLVideoElement | null | undefined): void {
  if (!video) return
  video.pause()
  video.currentTime = 0
  video.muted = true
}

/** Fully detach media from a video element — required on iOS to kill phantom audio. */
export function purgeVideoElement(video: HTMLVideoElement | null | undefined): void {
  if (!video) return
  video.pause()
  video.removeAttribute('src')
  video.load()
}

/** Pause and purge every video under a container. */
export function purgeVideosInContainer(container: HTMLElement | null | undefined): void {
  container?.querySelectorAll('video').forEach((element) => {
    purgeVideoElement(element)
  })
}
