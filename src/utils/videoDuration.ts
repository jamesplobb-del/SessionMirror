/** Best-effort playable duration for scrubbing (handles bad MP4 metadata). */
export function getPlayableDuration(video: HTMLVideoElement): number {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return video.duration
  }

  if (video.seekable.length > 0) {
    const end = video.seekable.end(video.seekable.length - 1)
    if (Number.isFinite(end) && end > 0) {
      return end
    }
  }

  return 0
}
